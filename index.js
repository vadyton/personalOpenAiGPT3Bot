const { Configuration, OpenAIApi } = require('openai');
const TelegramBot = require('node-telegram-bot-api');
const { config } = require("dotenv");
const axios = require("axios");
const { User } = require('./database/models')

config();

const openAiKey = process.env.OPENAI_API_KEY;
const botToken = process.env.TELEGRAM_API_TOKEN;
const adminId = process.env.ADMIN_ID;
const userIds = (process.env.USER_IDS).split(', ');
const apiKey = process.env.YANDEX_TRANSLATE_API_KEY;
const folderId = process.env.YANDEX_FOLDER_ID;

const bot = new TelegramBot(botToken, { polling: true });

const configuration = new Configuration({
    apiKey: openAiKey,
});
const openai = new OpenAIApi(configuration);

async function getResponseFromGPT3(text) {
    try {
        const response = await openai.createCompletion({
            model: "text-davinci-003",
            prompt: text,
            temperature: 0.5,
            max_tokens: 1000,
            top_p: 1.0,
            frequency_penalty: 0.5,
            presence_penalty: 0.0,
        });

        return response;
    } catch(error) {
        return `GPT-3 response error: ${error}`;
    }
}

async function getTranslate(text, lang = 'ru') {
    try {
        const config = {
            "headers": {
                "Content-Type": "application/json",
                "Authorization": `Api-Key ${apiKey}`
            }
        };

        const body = JSON.stringify({
            "targetLanguageCode": lang,
            "texts": [text],
            folderId,
        });

        const response = await axios.post('https://translate.api.cloud.yandex.net/translate/v2/translate', body, config)
        return response.data.translations[0].text;
    } catch(error) {
        return `Translate error: ${error}`;
    }
}

async function messageHandler(msg) {
    if (msg.text === '/start') {
        const [ user, created ] = await User.findOrCreate({
            where: { telegramId: msg.from.id},
            defaults: { telegramId: msg.from.id, username: msg.from.username, firstname: msg.from.first_name, lastname: msg.from?.last_name }
        });
        console.log(created, user);
        await bot.sendMessage(adminId, `New user ${msg.from.username}`);
    } else {
        const chatId = msg.chat.id;
        if (chatId == adminId || userIds.includes(`${chatId}`)) {
            const response = await getResponseFromGPT3(msg.text);
            const responseText = response.data.choices[0].text;
    
            const options = {
                reply_markup: JSON.stringify({
                    inline_keyboard: [[{
                        text: 'Translate',
                        callback_data: 'translate'
                    }]]
                })
            };
    
            bot.sendMessage(chatId, responseText, options);
        } else {
            bot.sendMessage(msg.chat.id, 'Access denied!')
        }
    }
}

bot.on('message', (msg) => messageHandler(msg))

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const text = query.message.text;
    const data = query.data;

    switch (data) {
        case 'translate':
            const translatedResponseText = await getTranslate(text);
            bot.sendMessage(chatId, translatedResponseText);
            break;
    }
});
