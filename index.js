require('dotenv').config(); // For local development

const express = require('express');
const { google } = require('googleapis');
const app = express();
const port = process.env.PORT || 3000;

// 🔐 Environment variables (set in Render)
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

// ✅ STEP 1: Return Google OAuth login URL
app.get('/auth', (req, res) => {
  const scopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/calendar'
  ];

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes
  });

  res.json({ authUrl });
});

// ✅ STEP 2: Handle the OAuth redirect
app.get('/oauth2callback', async (req, res) => {
  const code = req.query.code;

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    res.send('✅ Auth successful! You can now fetch emails and control your calendar.');
  } catch (error) {
    console.error('OAuth error:', error);
    res.status(500).send('OAuth failed');
  }
});

// ✅ STEP 3: Get recent inbox emails
app.get('/getEmails', async (req, res) => {
  if (!gmail) return res.status(401).send('Not authenticated yet.');

  try {
    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 10, // You can increase this
      q: 'in:inbox'
    });

    const messages = response.data.messages || [];

    const emails = await Promise.all(messages.map(async (msg) => {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'metadata',
        metadataHeaders: ['Subject', 'From']
      });

      const headers = detail.data.payload.headers.reduce((acc, h) => {
        acc[h.name] = h.value;
        return acc;
      }, {});

      return {
        id: msg.id,
        subject: headers.Subject || '(No Subject)',
        from: headers.From || '(Unknown Sender)'
      };
    }));

    res.json(emails);
  } catch (err) {
    console.error('Error fetching emails:', err);
    res.status(500).send('Error retrieving emails');
  }
});

// ✅ STEP 4: Create calendar event
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

// ✅ Start the server
app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});



