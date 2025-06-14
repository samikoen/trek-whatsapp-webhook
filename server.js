const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());

// Environment variables
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'trek_verify_2024';
const HUGGING_FACE_URL = process.env.HUGGING_FACE_URL || 'https://your-space.hf.space';
const WABA_ACCESS_TOKEN = process.env.WABA_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// Health check
app.get('/', (req, res) => {
    res.json({ 
        status: 'Trek WhatsApp Webhook Active! 🚴‍♂️',
        timestamp: new Date().toISOString()
    });
});

// Webhook verification (GET)
app.get('/webhook/waba', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    console.log('🔍 Webhook verification attempt:', { mode, token });
    
    if (mode && token && mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('✅ Webhook verified successfully!');
        res.status(200).send(challenge);
    } else {
        console.log('❌ Webhook verification failed');
        res.sendStatus(403);
    }
});

// Webhook message handler (POST)
app.post('/webhook/waba', async (req, res) => {
    const body = req.body;
    console.log('📨 Webhook received:', JSON.stringify(body, null, 2));
    
    try {
        if (body.object === 'whatsapp_business_account') {
            body.entry?.forEach(entry => {
                entry.changes?.forEach(change => {
                    if (change.value.messages) {
                        change.value.messages.forEach(async (message) => {
                            const from = message.from;
                            const text = message.text?.body;
                            const messageId = message.id;
                            const timestamp = message.timestamp;
                            
                            console.log(`📱 New message from ${from}: "${text}"`);
                            
                            // Hugging Face Space'e gönder ve yanıt al
                            if (text && from) {
                                await handleIncomingMessage(from, text, messageId);
                            }
                        });
                    }
                    
                    // Message status updates
                    if (change.value.statuses) {
                        change.value.statuses.forEach(status => {
                            console.log(`📊 Message status: ${status.status} for ${status.id}`);
                        });
                    }
                });
            });
            
            res.status(200).send('EVENT_RECEIVED');
        } else {
            console.log('❓ Unknown webhook object:', body.object);
            res.sendStatus(404);
        }
    } catch (error) {
        console.error('❌ Webhook processing error:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Gelen mesajları Hugging Face Space'e gönder
async function handleIncomingMessage(from, messageText, messageId) {
    try {
        console.log(`🤖 Sending to Hugging Face: "${messageText}"`);
        
        // Hugging Face Space'e istek gönder
        const hfResponse = await axios.post(`${HUGGING_FACE_URL}/chat`, {
            message: messageText,
            user_id: from,
            context: "Trek Bisiklet WhatsApp Business API",
            conversation_id: from
        }, {
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (hfResponse.status === 200) {
            const botReply = hfResponse.data.response || hfResponse.data.message || 'Anlayamadım, tekrar söyler misiniz?';
            console.log(`🎯 Bot response: "${botReply}"`);
            
            // WABA ile yanıt gönder
            await sendWABAMessage(from, botReply);
        } else {
            console.log('⚠️ Hugging Face yanıt vermedi:', hfResponse.status);
            await sendWABAMessage(from, 'Şu anda sistem yoğun, lütfen biraz sonra tekrar deneyin.');
        }
        
    } catch (error) {
        console.error('❌ Hugging Face hatası:', error.message);
        
        // Fallback yanıt
        await sendWABAMessage(from, 'Teknik bir sorun yaşıyoruz, en kısa sürede dönüş yapacağız. 🔧');
    }
}

// WABA ile mesaj gönder
async function sendWABAMessage(to, messageText) {
    try {
        const cleanNumber = to.replace('whatsapp:', '').replace('+', '');
        
        const response = await axios.post(
            `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: 'whatsapp',
                to: cleanNumber,
                type: 'text',
                text: {
                    body: messageText
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${WABA_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        console.log('✅ WABA mesajı gönderildi:', response.data);
        return response.data;
        
    } catch (error) {
        console.error('❌ WABA mesaj hatası:', error.response?.data || error.message);
        throw error;
    }
}

// Test endpoint
app.post('/test-message', async (req, res) => {
    const { to, message } = req.body;
    
    try {
        const result = await sendWABAMessage(to, message);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Error handling
app.use((error, req, res, next) => {
    console.error('🚨 Unhandled error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Trek WhatsApp Webhook running on port ${PORT}`);
    console.log(`📍 Webhook URL: https://your-app.railway.app/webhook/waba`);
    console.log(`🔑 Verify token: ${VERIFY_TOKEN}`);
});
