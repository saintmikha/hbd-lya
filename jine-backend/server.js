require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());

const server = http.createServer(app);
// Biggest file JINE may send to Discord, in MB (Discord allows 10 MB on most servers).
// Raise it in .env (MAX_UPLOAD_MB=25) only if your server's boost level allows bigger files.
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB) || 10;

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  maxHttpBufferSize: (MAX_UPLOAD_MB + 2) * 1024 * 1024   // socket.io's default (1 MB) would reject pictures
});

// --- CHAT HISTORY ---
const HISTORY_FILE = path.join(__dirname, 'messages.json');
const MAX_MESSAGES = 100;

// Load once at startup into memory
let chatHistory = [];
if (fs.existsSync(HISTORY_FILE)) {
  try {
    chatHistory = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    console.log(`Loaded ${chatHistory.length} messages from history.`);
  } catch (err) {
    console.error('Could not parse messages.json; starting fresh.', err);
    chatHistory = [];
  }
} else {
  console.log('No history file yet; will create one on first message.');
}

function persistHistory() {
  try {
    fs.writeFileSync(
      HISTORY_FILE,
      JSON.stringify(chatHistory, null, 2),
      'utf8'
    );
  } catch (err) {
    console.error('Error writing messages.json:', err);
  }
}

function addToHistory(msg) {
  chatHistory.push(msg);
  if (chatHistory.length > MAX_MESSAGES) {
    chatHistory = chatHistory.slice(-MAX_MESSAGES);
  }
  persistHistory();
}

// --- MEDIA DETECTION (GIFs, images, videos) ---
const LINK = /https?:\/\/\S+/i;
const IMAGE_FILE = /\.(png|jpe?g|gif|webp|avif)(\?|$)/i;
const VIDEO_FILE = /\.(mp4|webm|mov)(\?|$)/i;

// A video URL that is really a looping GIF (Twitter stores GIF tweets as mp4 under
// /tweet_video/; real tweet videos live under /ext_tw_video/ and get a normal player)
const GIF_VIDEO_URL = /(?:video\.twimg\.com\/tweet_video\/|(?:^|\.)klipy\.com\/|(?:^|\.)giphy\.com\/|(?:^|\.)tenor\.com\/)/i;

// Each item: { url, type, width, height, animated }
//   animated = true  -> shown like a GIF (silent, looping)
//   animated = false -> a normal picture or a video with a player
function collectMedia(message) {
  const media = [];
  const seen = new Set();
  // fallback = Discord's own proxy copy of the file, tried if the main address fails to load
  const add = (url, type, width, height, animated, fallback) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    media.push({ url, type, width: width || undefined, height: height || undefined, animated: !!animated,
                 fallback: fallback && fallback !== url ? fallback : undefined });
  };

  // 1) Files uploaded to Discord
  for (const att of message.attachments.values()) {
    const ct = att.contentType || '';
    const name = att.name || att.url;
    if (ct === 'image/gif' || /\.gif(\?|$)/i.test(name)) {
      add(att.url, 'image/gif', att.width, att.height, true, att.proxyURL);
    } else if ((ct.startsWith('image/') && !ct.includes('svg')) || IMAGE_FILE.test(name)) {
      add(att.url, ct || 'image/*', att.width, att.height, false, att.proxyURL);
    } else if (ct.startsWith('video/') || VIDEO_FILE.test(name)) {
      add(att.url, ct || 'video/mp4', att.width, att.height, false, att.proxyURL);
    }
  }

  // 2) Things Discord turned into embeds (links)
  for (const e of message.embeds) {
    const videoUrl = e.video?.url;
    const thumb = e.thumbnail || e.image;
    const thumbUrl = thumb?.url;

    if (videoUrl && (e.type === 'gifv' || GIF_VIDEO_URL.test(videoUrl))) {
      add(videoUrl, 'video/mp4', e.video.width, e.video.height, true);            // Tenor / Giphy / Klipy / tweet GIF
    } else if (e.type === 'gifv' && thumbUrl) {
      add(thumbUrl, 'image/gif', thumb.width, thumb.height, true);
    } else if (e.type === 'image' && thumbUrl) {
      const isGif = /\.gif(\?|$)/i.test(thumbUrl);                                  // a pasted picture link
      add(thumb.proxyURL || thumbUrl, isGif ? 'image/gif' : 'image/*', thumb.width, thumb.height, isGif);
    } else if (videoUrl && VIDEO_FILE.test(videoUrl)) {
      add(videoUrl, 'video/mp4', e.video.width, e.video.height, false);             // a pasted video file link
    } else if (thumbUrl && /(?:\.(?:gif|webp)(?:\?|$)|(?:^|\.)klipy\.com\/)/i.test(thumbUrl)) {
      add(thumbUrl, 'image/gif', thumb.width, thumb.height, true);
    }
  }
  return media;
}

// Discord adds link embeds a moment AFTER the message is created, so for messages with
// links we wait briefly and re-fetch the message before reading its embeds.
async function getMessageMedia(message) {
  let media = collectMedia(message);
  if (!media.length && LINK.test(message.content || '')) {
    await new Promise((r) => setTimeout(r, 1500));
    try { message = await message.fetch(true); } catch (e) { /* keep original */ }
    media = collectMedia(message);
  }
  // Set DEBUG_EMBEDS=1 in .env to log what Discord gave us (handy if something doesn't show)
  if (process.env.DEBUG_EMBEDS) {
    console.log('[attachments]', JSON.stringify([...message.attachments.values()].map(a => ({ name: a.name, type: a.contentType, url: a.url }))));
    console.log('[embeds]', JSON.stringify(message.embeds, null, 2));
    console.log('[media]', JSON.stringify(media));
  }
  return media;
}

// --- DISCORD BOT ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

client.once('ready', () => {
  console.log(`Bot logged in as ${client.user.tag}`);
});

// Messages are handled one at a time, in order, so a message that has to wait
// for its GIF embed can't be overtaken by the next one.
let messageQueue = Promise.resolve();

client.on('messageCreate', (message) => {
  if (message.author.bot) return;
  if (message.channel.id !== DISCORD_CHANNEL_ID) return;

  messageQueue = messageQueue
    .then(() => relayMessage(message))
    .catch((err) => console.error('Error relaying message:', err));
});

async function relayMessage(message) {
  const media = await getMessageMedia(message);

  // A picture/GIF/video-only message has empty text, so only skip when there is nothing at all
  if (!message.content && !media.length) return;

  const msgData = {
    text: message.content,
    media,
    sender: 'elle',
    timestamp: message.createdAt.toISOString()
  };

  addToHistory(msgData);
  io.emit('discord-message', msgData);
  console.log(`Sent to web: ${message.content}${media.length ? ` [+${media.length} media]` : ''}`);
  media.forEach((m) => console.log(`  media: ${m.type} ${m.url}`));
}

client.login(process.env.DISCORD_BOT_TOKEN);

// --- WEBSOCKET ---
io.on('connection', (socket) => {
  console.log('Lya connected to JINE');

  // Send existing history when she connects
  socket.emit('chat-history', chatHistory);

  socket.on('send-to-discord', async (data) => {
    try {
      const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);
      if (channel) {
        await channel.send(data.text);

        const msgData = {
          text: data.text,
          sender: 'lya',
          timestamp: new Date().toISOString()
        };

        addToHistory(msgData);
        console.log(`Sent to Discord: ${data.text}`);
      }
    } catch (err) {
      console.error('Error sending to Discord:', err);
    }
  });

  // Lya sends a picture or video from JINE
  socket.on('send-media-to-discord', async (data, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    try {
      if (!data || !data.data) return reply({ ok: false, error: "That file didn't arrive." });

      const type = String(data.type || '');
      if (!/^(image|video)\//.test(type) || type.includes('svg')) {
        return reply({ ok: false, error: 'Only pictures and videos can be sent.' });
      }

      const buf = Buffer.isBuffer(data.data) ? data.data : Buffer.from(data.data);
      if (buf.length > MAX_UPLOAD_MB * 1024 * 1024) {
        return reply({ ok: false, error: `That file is too big. The limit is ${MAX_UPLOAD_MB} MB.` });
      }

      // Safe file name: no folders, plain characters, keeps/gets an extension
      const ext = (type.split('/')[1] || 'bin').split(/[+;]/)[0].replace('quicktime', 'mov').replace('jpeg', 'jpg');
      let name = path.basename(String(data.name || '')).replace(/[^\w.\- ]/g, '_').slice(-80);
      if (!name || !/\.\w{2,5}$/.test(name)) name = `${name || 'upload'}.${ext}`;

      const text = String(data.text || '').trim().slice(0, 2000);

      const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);
      if (!channel) return reply({ ok: false, error: "I couldn't find the Discord channel." });

      const sent = await channel.send({
        content: text || undefined,
        files: [{ attachment: buf, name }]
      });

      addToHistory({
        text,
        media: collectMedia(sent),     // the copy now hosted on Discord, so it shows in the saved history
        sender: 'lya',
        timestamp: new Date().toISOString()
      });
      console.log(`Sent file to Discord: ${name} (${(buf.length / 1024).toFixed(0)} KB)`);
      reply({ ok: true });
    } catch (err) {
      console.error('Error sending file to Discord:', err);
      let error = "Couldn't send that file to Discord.";
      if (err && err.code === 50013) error = 'The bot is missing the "Attach Files" permission in that channel.';
      else if (err && err.code === 40005) error = 'Discord says that file is too big.';
      reply({ ok: false, error });
    }
  });

  socket.on('disconnect', () => {
    console.log('Lya disconnected');
  });
});

// --- START ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Bridge server running on port ${PORT}`);
});
