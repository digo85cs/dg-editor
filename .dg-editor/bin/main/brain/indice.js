"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.caminhoIndice = caminhoIndice;
exports.gerarIndice = gerarIndice;
exports.salvarIndice = salvarIndice;
exports.carregarIndiceCodigo = carregarIndiceCodigo;
exports.buscarSimbolos = buscarSimbolos;
exports.lerSimbolo = lerSimbolo;
/**
 * Indice de simbolos do DG Editor.
 * Parsing via TypeScript Compiler API — consciencia de codigo local.
 */
const typescript_1 = __importDefault(require("typescript"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const SINONIMOS = {
    escolher: ['buscar', 'selecionar', 'pick', 'choose', 'select'],
    ler: ['abrir', 'get', 'read', 'load', 'carregar'],
    escrever: ['gravar', 'salvar', 'write', 'save', 'set'],
    criar: ['gerar', 'make', 'create', 'new'],
    apagar: ['remover', 'delete', 'remove', 'excluir']
};
const IGNORAR_DIRS = new Set([
    'node_modules', 'out', 'dist', '.git', '.dg-editor', 'coverage', 'bin'
]);
function listarTs(raiz) {
    const saida = [];
    function walk(dir) {
        let ents;
        try {
            ents = fs_1.default.readdirSync(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const e of ents) {
            if (IGNORAR_DIRS.has(e.name))
                continue;
            const abs = path_1.default.join(dir, e.name);
            if (e.isDirectory())
                walk(abs);
            else if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts'))
                saida.push(abs);
        }
    }
    walk(path_1.default.join(raiz, 'src'));
    return saida;
}
function posLinha(sf, pos) {
    const p = sf.getLineAndCharacterOfPosition(pos);
    return { linha: p.line + 1, coluna: p.character + 1 };
}
function temExport(node) {
    const mods = typescript_1.default.canHaveModifiers(node) ? typescript_1.default.getModifiers(node) : undefined;
    return !!mods?.some((m) => m.kind === typescript_1.default.SyntaxKind.ExportKeyword);
}
function assinaturaFuncao(node, sf, nome) {
    const params = node.parameters.map((p) => p.getText(sf)).join(', ');
    const ret = node.type ? ': ' + node.type.getText(sf) : '';
    const asyncKw = node.modifiers?.some((m) => m.kind === typescript_1.default.SyntaxKind.AsyncKeyword) ? 'async ' : '';
    return `${asyncKw}${nome}(${params})${ret}`;
}
function extrairSimbolos(sf, rel) {
    const simbolos = [];
    function add(nome, tipo, node, assinatura, exportado) {
        const start = posLinha(sf, node.getStart(sf));
        const end = posLinha(sf, node.getEnd());
        simbolos.push({
            nome,
            tipo,
            arquivo: rel,
            linha: start.linha,
            coluna: start.coluna,
            assinatura,
            linhaInicio: start.linha,
            linhaFim: end.linha,
            exportado
        });
    }
    function visitar(node) {
        if (typescript_1.default.isFunctionDeclaration(node) && node.name) {
            const nome = node.name.text;
            add(nome, 'funcao', node, assinaturaFuncao(node, sf, nome), temExport(node));
        }
        else if (typescript_1.default.isClassDeclaration(node) && node.name) {
            const nome = node.name.text;
            add(nome, 'classe', node, `class ${nome}`, temExport(node));
            for (const m of node.members) {
                if ((typescript_1.default.isMethodDeclaration(m) || typescript_1.default.isConstructorDeclaration(m)) && (m.name || typescript_1.default.isConstructorDeclaration(m))) {
                    const mNome = typescript_1.default.isConstructorDeclaration(m) ? 'constructor' : m.name.text;
                    add(`${nome}.${mNome}`, 'funcao', m, assinaturaFuncao(m, sf, mNome), temExport(node));
                }
            }
        }
        else if (typescript_1.default.isInterfaceDeclaration(node)) {
            const nome = node.name.text;
            add(nome, 'interface', node, `interface ${nome}`, temExport(node));
        }
        else if (typescript_1.default.isTypeAliasDeclaration(node)) {
            const nome = node.name.text;
            const corpo = node.type.getText(sf);
            add(nome, 'type', node, `type ${nome} = ${corpo.slice(0, 120)}`, temExport(node));
        }
        else if (typescript_1.default.isVariableStatement(node)) {
            const exportado = temExport(node);
            for (const decl of node.declarationList.declarations) {
                if (!typescript_1.default.isIdentifier(decl.name))
                    continue;
                const nome = decl.name.text;
                if (!exportado && !/^[A-Z_][A-Z0-9_]*$/.test(nome))
                    continue;
                const tipoTxt = decl.type ? decl.type.getText(sf) : '';
                const init = decl.initializer;
                if (init && (typescript_1.default.isArrowFunction(init) || typescript_1.default.isFunctionExpression(init))) {
                    add(nome, 'funcao', decl, assinaturaFuncao(init, sf, nome), exportado);
                }
                else if (exportado) {
                    add(nome, 'const', decl, `const ${nome}${tipoTxt ? ': ' + tipoTxt : ''}`, true);
                }
            }
        }
        typescript_1.default.forEachChild(node, visitar);
    }
    visitar(sf);
    return simbolos;
}
function extrairReferencias(sf, rel, nomesConhecidos) {
    const refs = [];
    let escopoAtual = '(modulo)';
    function visitar(node) {
        if (typescript_1.default.isFunctionDeclaration(node) && node.name) {
            const prev = escopoAtual;
            escopoAtual = node.name.text;
            typescript_1.default.forEachChild(node, visitar);
            escopoAtual = prev;
            return;
        }
        if (typescript_1.default.isMethodDeclaration(node) && node.name && typescript_1.default.isIdentifier(node.name)) {
            const prev = escopoAtual;
            escopoAtual = node.name.text;
            typescript_1.default.forEachChild(node, visitar);
            escopoAtual = prev;
            return;
        }
        if (typescript_1.default.isImportDeclaration(node) && node.importClause) {
            const named = node.importClause.namedBindings;
            if (named && typescript_1.default.isNamedImports(named)) {
                for (const el of named.elements) {
                    const nome = el.name.text;
                    const { linha } = posLinha(sf, el.getStart(sf));
                    refs.push({ de: rel, para: nome, arquivo: rel, linha, tipo: 'import' });
                }
            }
            if (node.importClause.name) {
                const nome = node.importClause.name.text;
                const { linha } = posLinha(sf, node.importClause.name.getStart(sf));
                refs.push({ de: rel, para: nome, arquivo: rel, linha, tipo: 'import' });
            }
        }
        if (typescript_1.default.isCallExpression(node)) {
            let nomeChamado = '';
            if (typescript_1.default.isIdentifier(node.expression))
                nomeChamado = node.expression.text;
            else if (typescript_1.default.isPropertyAccessExpression(node.expression) && typescript_1.default.isIdentifier(node.expression.name)) {
                nomeChamado = node.expression.name.text;
            }
            if (nomeChamado && nomesConhecidos.has(nomeChamado)) {
                const { linha } = posLinha(sf, node.getStart(sf));
                refs.push({ de: escopoAtual, para: nomeChamado, arquivo: rel, linha, tipo: 'chamada' });
            }
        }
        typescript_1.default.forEachChild(node, visitar);
    }
    visitar(sf);
    return refs;
}
function caminhoIndice(raiz) {
    return path_1.default.join(raiz, '.dg-editor', 'indice-codigo.json');
}
function gerarIndice(raiz) {
    const arquivos = listarTs(raiz);
    const opcoes = {
        target: typescript_1.default.ScriptTarget.ES2022,
        module: typescript_1.default.ModuleKind.ESNext,
        moduleResolution: typescript_1.default.ModuleResolutionKind.Bundler,
        strict: false,
        skipLibCheck: true,
        allowJs: false
    };
    const host = typescript_1.default.createCompilerHost(opcoes);
    const program = typescript_1.default.createProgram(arquivos, opcoes, host);
    const simbolos = [];
    for (const abs of arquivos) {
        const sf = program.getSourceFile(abs);
        if (!sf)
            continue;
        const rel = path_1.default.relative(raiz, abs).replace(/\\/g, '/');
        simbolos.push(...extrairSimbolos(sf, rel));
    }
    const nomes = new Set(simbolos.map((s) => s.nome.includes('.') ? s.nome.split('.').pop() : s.nome));
    const referencias = [];
    for (const abs of arquivos) {
        const sf = program.getSourceFile(abs);
        if (!sf)
            continue;
        const rel = path_1.default.relative(raiz, abs).replace(/\\/g, '/');
        referencias.push(...extrairReferencias(sf, rel, nomes));
    }
    return {
        versao: 1,
        geradoEm: new Date().toISOString(),
        raiz,
        simbolos,
        referencias
    };
}
function salvarIndice(raiz, idx) {
    const p = caminhoIndice(raiz);
    fs_1.default.mkdirSync(path_1.default.dirname(p), { recursive: true });
    const tmp = p + '.tmp';
    fs_1.default.writeFileSync(tmp, JSON.stringify(idx, null, 2), 'utf8');
    fs_1.default.renameSync(tmp, p);
    return p;
}
function carregarIndiceCodigo(raiz) {
    const p = caminhoIndice(raiz);
    try {
        if (!fs_1.default.existsSync(p))
            return null;
        return JSON.parse(fs_1.default.readFileSync(p, 'utf8'));
    }
    catch {
        return null;
    }
}
function expandirTermo(termo) {
    const t = termo.toLowerCase();
    const set = new Set([t]);
    for (const [canon, alts] of Object.entries(SINONIMOS)) {
        if (canon === t || alts.includes(t) || t.includes(canon)) {
            set.add(canon);
            for (const a of alts)
                set.add(a);
        }
        for (const a of alts) {
            if (t.includes(a)) {
                set.add(canon);
                set.add(a);
            }
        }
    }
    return [...set];
}
function buscarSimbolos(raiz, termo, tipo) {
    let idx = carregarIndiceCodigo(raiz);
    if (!idx) {
        idx = gerarIndice(raiz);
        salvarIndice(raiz, idx);
    }
    const variantes = expandirTermo(termo);
    const mapaTipo = {
        funcao: ['funcao'],
        classe: ['classe'],
        tipo: ['interface', 'type'],
        todos: ['funcao', 'classe', 'interface', 'type', 'const']
    };
    const tiposOk = new Set(mapaTipo[tipo || 'todos'] || mapaTipo.todos);
    return idx.simbolos
        .filter((s) => tiposOk.has(s.tipo))
        .filter((s) => {
        const n = s.nome.toLowerCase();
        return variantes.some((v) => n.includes(v) || n.includes(termo.toLowerCase()));
    })
        .map((s) => ({
        nome: s.nome,
        tipo: s.tipo,
        arquivo: s.arquivo,
        linha: s.linha,
        assinatura: s.assinatura
    }));
}
function lerSimbolo(raiz, nome) {
    let idx = carregarIndiceCodigo(raiz);
    if (!idx) {
        idx = gerarIndice(raiz);
        salvarIndice(raiz, idx);
    }
    const hit = idx.simbolos.find((s) => s.nome === nome)
        || idx.simbolos.find((s) => s.nome.endsWith('.' + nome))
        || idx.simbolos.find((s) => s.nome.toLowerCase() === nome.toLowerCase());
    if (!hit)
        return null;
    const abs = path_1.default.join(raiz, hit.arquivo);
    const linhas = fs_1.default.readFileSync(abs, 'utf8').split(/\r?\n/);
    const corpo = linhas.slice(hit.linhaInicio - 1, hit.linhaFim).join('\n');
    const chamadoPor = idx.referencias
        .filter((r) => r.tipo === 'chamada' && (r.para === nome || r.para === hit.nome || hit.nome.endsWith('.' + r.para)))
        .map((r) => `${r.de} @ ${r.arquivo}:${r.linha}`);
    return {
        arquivo: hit.arquivo,
        linhaInicio: hit.linhaInicio,
        linhaFim: hit.linhaFim,
        corpo,
        chamadoPor: [...new Set(chamadoPor)]
    };
}
