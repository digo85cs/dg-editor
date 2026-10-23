"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadChat = loadChat;
exports.appendChat = appendChat;
exports.clearChat = clearChat;
const fs_1 = require("fs");
const path_1 = require("path");
const CHAT_DIR = '.dg-editor';
const CHAT_FILE = 'chat.json';
function chatPath(root) {
    return (0, path_1.join)(root, CHAT_DIR, CHAT_FILE);
}
function loadChat(root) {
    const p = chatPath(root);
    if (!(0, fs_1.existsSync)(p))
        return [];
    try {
        const data = JSON.parse((0, fs_1.readFileSync)(p, 'utf-8'));
        return data.messages ?? [];
    }
    catch {
        return [];
    }
}
function appendChat(root, message) {
    const messages = loadChat(root);
    messages.push(message);
    // teto de seguranca: ultimas 200 mensagens
    const trimmed = messages.slice(-200);
    const dir = (0, path_1.join)(root, CHAT_DIR);
    if (!(0, fs_1.existsSync)(dir))
        (0, fs_1.mkdirSync)(dir, { recursive: true });
    (0, fs_1.writeFileSync)(chatPath(root), JSON.stringify({ messages: trimmed }, null, 2), 'utf-8');
}
function clearChat(root) {
    const dir = (0, path_1.join)(root, CHAT_DIR);
    if (!(0, fs_1.existsSync)(dir))
        (0, fs_1.mkdirSync)(dir, { recursive: true });
    (0, fs_1.writeFileSync)(chatPath(root), JSON.stringify({ messages: [] }, null, 2), 'utf-8');
}
