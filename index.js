import { Configuration, OpenAIApi } from 'openai';
import TelegramBot from 'node-telegram-bot-api';
import { config } from "dotenv";

config();

const openAiKey = process.env.OPENAI_API_KEY;
const botToken = process.env.TELEGRAM_API_TOKEN;
const adminId = process.env.ADMIN_ID;

const bot = new TelegramBot(botToken, { polling: true });

const configuration = new Configuration({
    apiKey: openAiKey,
});
const openai = new OpenAIApi(configuration);

async function getResponseFromGPT3(text) {
    const response = await openai.createCompletion({
        model: "text-davinci-003",
        prompt: text,
        temperature: 0.5,
        max_tokens: 360,
        top_p: 1.0,
        frequency_penalty: 0.5,
        presence_penalty: 0.0,
    });

    return response;
}

async function messageHandler(msg) {
    if (msg.from.id == adminId) {
        const res = await getResponseFromGPT3(msg.text);
        bot.sendMessage(msg.chat.id, res.data.choices[0].text);
    } else {
        bot.sendMessage(msg.chat.id, 'Access denied!')
    }
}

bot.on('message', (msg) => messageHandler(msg))
