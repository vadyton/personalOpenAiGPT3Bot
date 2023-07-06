const { Configuration, OpenAIApi } = require('openai');
const TelegramBot = require('node-telegram-bot-api');
const { config } = require("dotenv");
const axios = require("axios");
const { User } = require('./database/models')
const {
    TRANSLATE,
    ACCESS,
    CANCEL_ACCESS
} = require('./constants/callbackTypes');

config();

const openAiKey = process.env.OPENAI_API_KEY;
const botToken = process.env.TELEGRAM_API_TOKEN;
const adminId = +process.env.ADMIN_ID;
const yandexTranslateApiKey = process.env.YANDEX_TRANSLATE_API_KEY;
const folderId = process.env.YANDEX_FOLDER_ID;
let userIds = [];

(async function updateUserIds() {
    try {
        userIds = (await User.findAll({
            where: { access: true },
            attributes: ['telegramId']
        })).map((el) => +(el.toJSON()).telegramId);

        console.log(userIds);
    } catch (error) {
        console.log(error.message);
    }
}());

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
                "Authorization": `Api-Key ${yandexTranslateApiKey}`
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

async function findOrCreateUser(msg) {
    try {
        const [ user, isCreated ] = await User.findOrCreate({
            where: { telegramId: String(msg.from.id)},
            defaults: {
                telegramId: msg.from.id,
                username: msg.from.username,
                firstname: msg.from?.first_name,
                lastname: msg.from?.last_name,
                access: false,
            }
        });

        let text = '';

        if (isCreated) {
            text = `New user @${msg.from.username} with id:${msg.from.id}`;
            requestAccess(text);
        } else if (!user.access) {
            text = `User @${msg.from.username}  with id:${msg.from.id} requests access`;
            requestAccess(text);
        } else {
            bot.sendMessage(msg.chat.id, 'С возвращением!');
        }
    } catch (error) {
        bot.sendMessage(adminId, `New user error ${error.message}`);
    }
}

async function gptConversation(msg) {
    const chatId = msg.chat.id;
    const isAccessAllowed = userIds.includes(chatId) || chatId === adminId;

    if (isAccessAllowed) {
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
        accessWasDenied(msg.chat.id);
    }
}

function requestAccess(text) {
    const menu_options = {
        reply_markup: JSON.stringify({
            inline_keyboard: [
                [
                    {
                        text: 'Give access',
                        callback_data: ACCESS,
                    },
                    {
                        text: 'Cancel',
                        callback_data: CANCEL_ACCESS,
                    }
                ]
            ]
        })
    }

    bot.sendMessage(adminId, text, menu_options);
}

async function messageHandler(msg) {
    switch (msg.text) {
        case '/start':
            findOrCreateUser(msg);
            break;
        default:
            gptConversation(msg);
    }
}

async function sendTranslation(chatId, text) {
    const translatedResponseText = await getTranslate(text);
    bot.sendMessage(chatId, translatedResponseText);
}

async function giveAccessToUser(id) {
    try {
        const user = await User.update({ access: true }, { where: { telegramId: id } });
        userIds.push(+id);

        bot.sendMessage(adminId, `Access for user has been granted!`);
        bot.sendMessage(id, `Congratulations! Access has been granted for you.`);
    } catch (error) {
        bot.sendMessage(adminId, `Give access error ${error.message}`);
    }
}

function accessWasDenied(chatId) {
    bot.sendMessage(chatId, 'Access denied!')
}

async function callbackQueryHandler(query){
    const chatId = query.message.chat.id;
    const text = query.message.text;
    const data = query.data;

    const userIdRegex = new RegExp(/id:(\d+)/);
    const userId = userIdRegex.exec(query.message.text)[1];

    switch (data) {
        case TRANSLATE:
            sendTranslation(chatId, text);
            break;
        case ACCESS:
            giveAccessToUser(userId);
            break;
        case CANCEL_ACCESS:
            accessWasDenied(userId);
            break;

    }
}

bot.on('message', (msg) => messageHandler(msg))
bot.on('callback_query', (query) => callbackQueryHandler(query));
