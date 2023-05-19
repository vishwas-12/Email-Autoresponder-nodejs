const fs = require('fs');
const express = require("express");
const readline = require('readline');
const { google } = require('googleapis');
const { GoogleAuth } = require('google-auth-library');
const axios = require('axios');
const app = express();
app.listen(3000, () => {
    console.log('Server is listening on port 3000');
});
app.get('/oAuth2Client', (req, res) => {
    const code = req.query.code;
    console.log(code);
});


const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];
const TOKEN_PATH = 'token.json';
const LABEL_NAME = 'VacationMessages';

// Load client secrets from a local file.
fs.readFile('client_secret_61350749136-i8om9pbok453b54keo0n3c4unbhqpfhv.apps.googleusercontent.com.json', (err, content) => {
    if (err) {
        console.log('Error loading client secret file:', err);
        return;
    }
    authorize(JSON.parse(content), processEmails);
});

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 *
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
    const { client_secret, client_id, redirect_uris } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris[0]
    );

    fs.readFile(TOKEN_PATH, (err, token) => {
        if (err) {
            getNewToken(oAuth2Client, callback);
        } else {
            oAuth2Client.setCredentials(JSON.parse(token));
            callback(oAuth2Client);
        }
    });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 *
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {function} callback The callback to call with the authorized client.
 */
function getNewToken(oAuth2Client, callback) {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });
    console.log('Authorize this app by visiting this url:', authUrl);
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    rl.question('Enter the code from that page here: ', (code) => {
        rl.close();
        oAuth2Client.getToken(code, (err, token) => {
            if (err) {
                console.error('Error while trying to retrieve access token:', err);
                return;
            }
            oAuth2Client.setCredentials(token);
            fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
                if (err) {
                    console.error('Error storing access token:', err);
                    return;
                }
                console.log('Token stored to', TOKEN_PATH);
            });
            callback(oAuth2Client);
        });
    });
}

/**
 * Process the emails by fetching and replying to new unread messages and
 * adding them to a particular label.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function processEmails(auth) {
    const gmail = google.gmail({ version: 'v1', auth });

    // Function to retrieve and process unread messages
    const retrieveUnreadMessages = () => {
        gmail.users.messages.list(
            {
                userId: 'me',
                q: 'is:unread',
            },
            (err, res) => {
                if (err) {
                    console.error('The API returned an error:', err);
                    return;
                }

                const messages = res.data.messages;
                if (messages && messages.length) {
                    messages.forEach((message) => {
                        processMessage(gmail, message.id);
                    });
                } else {
                    console.log('No new unread messages found.');
                }
            }
        );
    };

    // Function to process a single message
    const processMessage = (gmail, messageId) => {
        gmail.users.messages.get(
            {
                userId: 'me',
                id: messageId,
            },
            (err, res) => {
                if (err) {
                    console.error('Error retrieving message:', err);
                    return;
                }

                const message = res.data;
                const { from, subject } = getMessageHeaders(message);

                // Log details of the message
                console.log('From:', from);
                console.log('Subject:', subject);

                // Reply to the message
                replyToMessage(gmail, message);

                // Add label to the message
                addLabelToMessage(gmail, message, LABEL_NAME);
            }
        );
    };

    // Function to retrieve relevant headers from a message
    const getMessageHeaders = (message) => {
        const headers = message.payload.headers.reduce((acc, header) => {
            acc[header.name.toLowerCase()] = header.value;
            return acc;
        }, {});

        return {
            from: headers.from,
            subject: headers.subject,
        };
    };

    // Function to reply to a message
    const replyToMessage = (gmail, message) => {
        const replyMessage = 'Hey! I am actually out of town, will reply as soon as I get back';

        const threadId = message.threadId;
        const reply = {
            threadId: threadId,
            requestBody: {
                raw: Buffer.from(
                    `From: ${message.payload.headers.find(
                        (header) => header.name === 'To'
                    ).value}\r\n` +
                    `To: ${message.payload.headers.find(
                        (header) => header.name === 'From'
                    ).value}\r\n` +
                    'Content-Type: text/plain; charset="UTF-8"\r\n' +
                    `Subject: Re: ${message.payload.headers.find(
                        (header) => header.name === 'Subject'
                    ).value}\r\n\r\n` +
                    `${replyMessage}`
                ).toString('base64'),
            },
        };

        gmail.users.messages.send(
            {
                userId: 'me',
                requestBody: reply.requestBody,
            },
            (err, res) => {
                if (err) {
                    console.error('Error replying to message:', err);
                    return;
                }

                console.log('Reply sent successfully!');
            }
        );
    };

    // Function to add a label to a message
    const addLabelToMessage = (gmail, message, labelName) => {
        const labelsToAdd = {
            addLabelIds: [labelName],
        };

        gmail.users.messages.modify(
            {
                userId: 'me',
                id: message.id,
                requestBody: labelsToAdd,
            },
            (err, res) => {
                if (err) {
                    console.error('Error adding label to message:', err);
                    return;
                }

                console.log(`Message added to the label '${labelName}' successfully!`);
            }
        );
    };

    // Start the email processing
    setInterval(retrieveUnreadMessages, getRandomInterval());
}

/**
 * Generate a random interval between 45 and 120 seconds (inclusive).
 *
 * @returns {number} Random interval in milliseconds.
 */
function getRandomInterval() {
    const min = 45;
    const max = 120;
    const interval = Math.floor(Math.random() * (max - min + 1) + min);
    return interval * 1000; // Convert to milliseconds
}
