"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBrain = getBrain;
exports.__resetBrainForTests = __resetBrainForTests;
/**
 * Fachada unica do brain — apenas Ollama local (offline-only).
 * Substitui a antiga pilha providers/router/policy.
 */
const ollama_1 = require("./ollama");
const brain = {
    async ask(prompt, context, _preferido, tarefa) {
        return (0, ollama_1.askOllama)(prompt, context, tarefa || 'codigo');
    },
    getActiveProvider() {
        return 'ollama';
    },
    async getProviderStatuses() {
        const available = await (0, ollama_1.ollamaPing)();
        const models = available ? (await (0, ollama_1.listModelos)()).length : 0;
        return [{ name: 'ollama', available, models }];
    },
    getOllamaStatus: ollama_1.getOllamaStatus,
    listActiveModels: ollama_1.listModelos
};
function getBrain() {
    return brain;
}
function __resetBrainForTests() {
    /* singleton estatico — nada a resetar */
}
