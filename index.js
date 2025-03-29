require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const app = express();
const port = process.env.PORT || 3000;

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

let gmail = null;
let calendar = null;

app.use(express.json());

// Auth URL for manual login
app.get('/auth', (req, res) => {
  const scopes = [
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/calendar'
  ];

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes
  });

  res.json({ authUrl });
});

// Handle Google OAuth callback
app.get('/oauth2callback', async (req, res) => {
  const code = req.query.code;

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    res.send('✅ Auth successful! Full Gmail and Calendar access granted.');
  } catch (error) {
    console.error('OAuth error:', error);
    res.status(500).send('OAuth failed');
  }
});

// Get full email content
app.get('/getEmails', async (req, res) => {
  if (!gmail) return res.status(401).send('Not authenticated yet.');

  try {
    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 10,
      q: 'in:inbox'
    });

    const messages = response.data.messages || [];

    const emails = await Promise.all(messages.map(async (msg) => {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'full'
      });

      const headers = detail.data.payload.headers.reduce((acc, h) => {
        acc[h.name] = h.value;
        return acc;
      }, {});

      const body = extractEmailBody(detail.data.payload);

      return {
        id: msg.id,
        subject: headers.Subject || '(No Subject)',
        from: headers.From || '(Unknown Sender)',
        snippet: detail.data.snippet,
        body
      };
    }));

    res.json(emails);
  } catch (err) {
    console.error('Error fetching emails:', err);
    res.status(500).send('Error retrieving emails');
  }
});

// Helper: Extract plain text body
function extractEmailBody(payload) {
  if (!payload.parts) {
    const data = payload.body.data;
    return data ? Buffer.from(data, 'base64').toString('utf-8') : '';
  }

  const part = payload.parts.find(p => p.mimeType === 'text/plain');
  if (part && part.body && part.body.data) {
    return Buffer.from(part.body.data, 'base64').toString('utf-8');
  }

  return '';
}

// Create calendar event
app.post('/createEvent', async (req, res) => {
  if (!calendar) return res.status(401).send('Not authenticated yet.');

  const { summary, start, end } = req.body;

  try {
    const event = {
      summary,
      start: { dateTime: start, timeZone: 'America/New_York' },
      end: { dateTime: end, timeZone: 'America/New_York' }
    };

    const result = await calendar.events.insert({
      calendarId: 'primary',
      resource: event
    });

    res.json({ success: true, eventId: result.data.id });
  } catch (err) {
    console.error('Error creating event:', err);
    res.status(500).send('Error creating event');
  }
});

// List calendar events
app.get('/listEvents', async (req, res) => {
  if (!calendar) return res.status(401).send('Not authenticated yet.');

  try {
    const response = await calendar.events.list({
      calendarId: 'primary',
      maxResults: 10,
      singleEvents: true,
      orderBy: 'startTime'
    });

    const events = response.data.items.map(event => ({
      id: event.id,
      summary: event.summary,
      start: event.start,
      end: event.end
    }));

    res.json(events);
  } catch (err) {
    console.error('Error listing events:', err);
    res.status(500).send('Error retrieving calendar events');
  }
});

// Start server
app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
