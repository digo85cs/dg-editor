/**
 * Personalização de imagens ISO: extrair, injetar arquivos e reconstruir uma
 * ISO inicializável preservando as entradas El Torito (BIOS + UEFI).
 *
 * Usa pycdlib (Python, gratuito) instalado no Python portátil do app. Se faltar,
 * cai para a montagem nativa do Windows (Mount-DiskImage, exige admin) na
 * extração. Nada é enviado para a nuvem.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import {
  caminhoRelativo,
  destinoArquivo,
  nomeArquivo,
  pastaMidia,
  pythonBin,
  rodar,
  slug,
  type RespostaMidia
} from '../midia/core'
import { isInsidePath } from '../paths'

const SCRIPT_PY = String.raw`
import json, os, shutil, sys

def falha(msg):
    print(json.dumps({'ok': False, 'erro': msg}))
    sys.exit(0)

try:
    import pycdlib
except Exception as e:
    print(json.dumps({'ok': False, 'erro': 'pycdlib ausente: ' + str(e)}))
    sys.exit(0)

def safe_rel(iso_path):
    p = iso_path.split(';')[0].lstrip('/')
    parts = [x for x in p.split('/') if x not in ('', '.', '..')]
    return os.path.join(*parts) if parts else ''

def walk_items(iso):
    for root, dirs, files in iso.walk(iso_path='/'):
        for f in files:
            yield ((root.rstrip('/') + '/' + f).replace('//', '/'), False)
        for d in dirs:
            yield ((root.rstrip('/') + '/' + d).replace('//', '/'), True)

def extrair(iso, destino):
    n = 0
    for ip, pasta in walk_items(iso):
        if pasta:
            continue
        rel = safe_rel(ip)
        if not rel:
            continue
        out = os.path.join(destino, rel)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, 'wb') as fp:
            iso.get_file_from_iso_fp(fp, iso_path=ip)
        n += 1
    return n

def mapa_inodes(iso):
    m = {}
    for ip, pasta in walk_items(iso):
        if pasta:
            continue
        try:
            rec = iso.get_record(iso_path=ip)
        except Exception:
            continue
        ino = getattr(rec, 'inode', None)
        if ino is not None:
            m[id(ino)] = ip
    return m

def entradas_boot(iso, mapa):
    itens = []
    cat = getattr(iso, 'eltorito_boot_catalog', None)
    if not cat:
        return itens
    def registrar(entrada, plataforma):
        ino = getattr(entrada, 'inode', None)
        caminho = mapa.get(id(ino)) if ino is not None else None
        if not caminho:
            return
        itens.append({
            'path': caminho,
            'platform': int(plataforma),
            'efi': int(plataforma) == 0xEF,
            'load_size': int(getattr(entrada, 'sector_count', 4) or 4),
            'boot_info_table': bool(getattr(ino, 'boot_info_table', False)) or 'isolinux' in caminho.lower()
        })
    inicial = getattr(cat, 'initial_entry', None)
    if inicial is not None and getattr(inicial, 'boot_indicator', 0) == 0x88:
        registrar(inicial, 0)
    for secao in getattr(cat, 'sections', []) or []:
        plataforma = int(getattr(secao, 'platform_id', 0))
        for entrada in getattr(secao, 'section_entries', []) or []:
            if getattr(entrada, 'boot_indicator', 0) == 0x88:
                registrar(entrada, plataforma)
    return itens

def resolver_ci(base, rel):
    atual = base
    for parte in rel.replace('\\', '/').split('/'):
        if not parte:
            continue
        alvo = os.path.join(atual, parte)
        if os.path.exists(alvo):
            atual = alvo
            continue
        achado = None
        try:
            for nome in os.listdir(atual):
                if nome.lower() == parte.lower():
                    achado = os.path.join(atual, nome)
                    break
        except FileNotFoundError:
            achado = None
        atual = achado or alvo
    return atual

def copiar_overlay(origem, destino):
    n = 0
    for root, dirs, files in os.walk(origem):
        rel = os.path.relpath(root, origem).replace('\\', '/')
        alvo = destino if rel == '.' else resolver_ci(destino, rel)
        os.makedirs(alvo, exist_ok=True)
        for f in files:
            shutil.copy2(os.path.join(root, f), os.path.join(alvo, f))
            n += 1
    return n

def nome_seguro(parte):
    nome = parte.upper().replace(' ', '_')
    nome = ''.join(c if (c.isalnum() or c in '._') else '_' for c in nome)
    raiz, ext = os.path.splitext(nome)
    if len(nome) > 30:
        nome = raiz[:max(1, 30 - len(ext))] + ext
    return nome or '_'

def nome_iso_seguro(rel):
    partes = rel.replace('\\', '/').split('/')
    return '/'.join([nome_seguro(p) for p in partes if p])

def construir(origem_dir, saida, volume_id, boots, usar_udf):
    iso = pycdlib.PyCdlib()
    kwargs = dict(interchange_level=3, joliet=3, vol_ident=(volume_id or 'DG_ISO')[:32])
    if usar_udf:
        kwargs['udf'] = '2.60'
    iso.new(**kwargs)
    dirs_feitos = set()
    avisos = []
    def garantir_dir(rel):
        partes = rel.split('/')
        acumulado = ''
        for parte in partes:
            seguro = nome_seguro(parte)
            acumulado = (acumulado + '/' + seguro) if acumulado else seguro
            chave = acumulado.lower()
            if chave in dirs_feitos:
                continue
            try:
                p = {'iso_path': '/' + acumulado.upper()}
                if True:
                    p['joliet_path'] = '/' + acumulado.lower()
                if usar_udf:
                    p['udf_path'] = '/' + acumulado.lower()
                iso.add_directory(**p)
            except Exception as e:
                avisos.append('pasta ' + acumulado + ': ' + str(e))
            dirs_feitos.add(chave)
    adicionados = {}
    catalogos = {'boot.cat'}
    if any(b.get('efi') for b in boots):
        catalogos.add('efi/boot/boot.cat')
        garantir_dir('EFI/BOOT')
    for root, dirs, files in os.walk(origem_dir):
        rel = os.path.relpath(root, origem_dir).replace('\\', '/')
        if rel != '.':
            garantir_dir(rel)
        for f in sorted(files):
            relf = (rel + '/' + f) if rel != '.' else f
            if relf.lower() in catalogos:
                continue
            destino = os.path.join(root, f)
            dados = open(destino, 'rb').read()
            iso_nome = nome_iso_seguro(relf)
            parametros = {'iso_path': '/' + iso_nome + ';1'}
            if True:
                parametros['joliet_path'] = '/' + relf.lower()
            if usar_udf:
                parametros['udf_path'] = '/' + relf.lower()
            try:
                iso.add_fp(__import__('io').BytesIO(dados), len(dados), **parametros)
                adicionados[relf.lower()] = iso_nome
            except Exception as e:
                avisos.append('arquivo ' + relf + ': ' + str(e))
    for b in boots:
        rel_boot = b['path'].split(';')[0].lstrip('/')
        iso_nome = adicionados.get(rel_boot.lower())
        if not iso_nome:
            avisos.append('boot ' + rel_boot + ': arquivo não encontrado na nova árvore')
            continue
        caminho = iso_nome.upper()
        try:
            iso.add_eltorito(
                '/' + caminho + ';1',
                bootcatfile=('/BOOT.CAT;1' if b['platform'] == 0 else '/EFI/BOOT/BOOT.CAT;1'),
                boot_load_size=int(b.get('load_size') or 4),
                platform_id=int(b['platform']),
                boot_info_table=bool(b.get('boot_info_table')),
                efi=bool(b.get('efi')),
                media_name='noemul'
            )
        except Exception as e:
            avisos.append('boot ' + caminho + ': ' + str(e))
    iso.write(saida)
    iso.close()
    return avisos

modo = sys.argv[1] if len(sys.argv) > 1 else 'status'
try:
    if modo == 'status':
        versao = getattr(pycdlib, '__version__', 'ok')
        print(json.dumps({'ok': True, 'versao': str(versao)}))
    elif modo == 'extrair':
        origem, destino = sys.argv[2], sys.argv[3]
        iso = pycdlib.PyCdlib(); iso.open(origem)
        total = extrair(iso, destino)
        volume = iso.pvd.volume_identifier.decode('latin1', 'replace').strip()
        iso.close()
        print(json.dumps({'ok': True, 'arquivos': total, 'volume_id': volume}))
    elif modo == 'listar':
        origem = sys.argv[2]
        limite = int(sys.argv[3]) if len(sys.argv) > 3 else 200
        iso = pycdlib.PyCdlib(); iso.open(origem)
        itens = []
        for ip, pasta in walk_items(iso):
            itens.append({'caminho': ip, 'pasta': bool(pasta)})
            if len(itens) >= limite:
                break
        iso.close()
        print(json.dumps({'ok': True, 'itens': itens}))
    elif modo == 'reconstruir':
        origem, overlay, saida = sys.argv[2], sys.argv[3], sys.argv[4]
        rotulo = sys.argv[5] if len(sys.argv) > 5 else ''
        iso = pycdlib.PyCdlib(); iso.open(origem)
        volume = rotulo or iso.pvd.volume_identifier.decode('latin1', 'replace').strip()
        mapa = mapa_inodes(iso)
        boots = entradas_boot(iso, mapa)
        try:
            usar_udf = bool(iso.has_udf())
        except Exception:
            usar_udf = False
        trabalho = saida + '.work'
        if os.path.isdir(trabalho):
            shutil.rmtree(trabalho)
        os.makedirs(trabalho, exist_ok=True)
        total = extrair(iso, trabalho)
        iso.close()
        injetados = copiar_overlay(overlay, trabalho) if overlay and os.path.isdir(overlay) else 0
        avisos = []
        try:
            avisos = construir(trabalho, saida, volume, boots, usar_udf)
            udf_final = usar_udf
        except Exception as e:
            if usar_udf:
                avisos = ['UDF indisponível (' + str(e) + '); gerando ISO 9660/Joliet']
                avisos += construir(trabalho, saida, volume, boots, False)
                udf_final = False
            else:
                raise
        shutil.rmtree(trabalho, ignore_errors=True)
        print(json.dumps({'ok': True, 'arquivos': total, 'injetados': injetados, 'boot': boots, 'udf': udf_final, 'volume_id': volume, 'avisos': avisos}))
    else:
        falha('modo desconhecido: ' + modo)
except Exception as e:
    print(json.dumps({'ok': False, 'erro': type(e).__name__ + ': ' + str(e)}))
`

const SCRIPT_MONTAR = String.raw`
param([Parameter(Mandatory=$true)][string]$Image, [Parameter(Mandatory=$true)][string]$Dest)
$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  [Console]::Out.WriteLine('ERRO montagem de ISO exige administrador (instale o suporte pycdlib para extrair sem admin)')
  exit 3
}
$montada = $false
try {
  $img = Mount-DiskImage -ImagePath $Image -PassThru
  $montada = $true
  $vol = $img | Get-Volume
  $letra = $vol.DriveLetter
  if (-not $letra) { throw 'ISO montada sem letra de unidade' }
  New-Item -ItemType Directory -Force -Path $Dest | Out-Null
  Copy-Item -Path ($letra + ':\*') -Destination $Dest -Recurse -Force
  [Console]::Out.WriteLine('OK')
} finally {
  if ($montada) { Dismount-DiskImage -ImagePath $Image | Out-Null }
}
`

export type SuporteIso = { ok: boolean; versao?: string; erro?: string }

function executarPython(args: string[], timeoutMs: number): ReturnType<typeof rodar> {
  return rodar(pythonBin(), args, timeoutMs)
}

function lerJson(stdout: string): Record<string, unknown> | null {
  const linha = stdout
    .split(/\r?\n/)
    .reverse()
    .find((l) => l.trim().startsWith('{'))
  if (!linha) return null
  try {
    return JSON.parse(linha) as Record<string, unknown>
  } catch {
    return null
  }
}

export async function suporteIso(): Promise<SuporteIso> {
  const r = await executarPython(['-c', 'import pycdlib;print(getattr(pycdlib,"__version__","ok"))'], 30_000)
  if (!r.ok) return { ok: false, erro: 'pycdlib não instalado no Python do app' }
  return { ok: true, versao: r.stdout.trim() }
}

export async function instalarSuporteIso(): Promise<SuporteIso> {
  const r = await executarPython(['-m', 'pip', 'install', '--upgrade', 'pycdlib'], 10 * 60 * 1000)
  if (!r.ok) return { ok: false, erro: (r.erro || r.stderr || 'pip falhou').slice(0, 400) }
  return suporteIso()
}

function pastaImagens(raiz: string): string {
  const p = join(pastaMidia(raiz), 'imagens')
  mkdirSync(p, { recursive: true })
  return p
}

export function criarPastaOverlay(raiz: string): { caminho: string; caminhoRel: string } {
  const p = join(pastaImagens(raiz), 'overlay')
  mkdirSync(p, { recursive: true })
  return { caminho: p, caminhoRel: caminhoRelativo(raiz, p) }
}

// ---------------------------------------------------------------- unattend

export type OpcoesUnattend = {
  edicao?: string
  canal?: string
  locale?: string
  fusoHorario?: string
  nomePc?: string
  pularOobe?: boolean
  aceitarEula?: boolean
}

const EDICOES_VALIDAS = new Set(['Core', 'Professional', 'ProfessionalN', 'Enterprise', 'Education', 'HomeSingleLanguage'])
const CANAIS_VALIDOS = new Set(['Retail', 'OEM', 'Volume'])

export function escaparXml(valor: string): string {
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function opcoesSanitizadas(o: OpcoesUnattend): Required<OpcoesUnattend> {
  const locale = /^[a-z]{2}-[A-Z]{2}$/.test(String(o.locale || '')) ? String(o.locale) : 'pt-BR'
  const fuso = /^[A-Za-z][A-Za-z ._\-]{2,59}$/.test(String(o.fusoHorario || ''))
    ? String(o.fusoHorario)
    : 'E. South America Standard Time'
  const nomePc = /^[A-Za-z0-9-]{1,15}$/.test(String(o.nomePc || '')) ? String(o.nomePc) : 'DG-PC'
  const edicao = EDICOES_VALIDAS.has(String(o.edicao || '')) ? String(o.edicao) : 'Professional'
  const canal = CANAIS_VALIDOS.has(String(o.canal || '')) ? String(o.canal) : 'Retail'
  return {
    edicao,
    canal,
    locale,
    fusoHorario: fuso,
    nomePc,
    pularOobe: o.pularOobe !== false,
    aceitarEula: o.aceitarEula !== false
  }
}

/** autounattend.xml para Windows 10/11: idioma, EULA e OOBE sem supervisão. */
export function construirUnattend(o: OpcoesUnattend = {}): string {
  const c = opcoesSanitizadas(o)
  const oobe = c.pularOobe
    ? `      <OOBE>
        <HideEULAPage>true</HideEULAPage>
        <HideOEMRegistrationScreen>true</HideOEMRegistrationScreen>
        <HideOnlineAccountScreens>true</HideOnlineAccountScreens>
        <HideWirelessSetupInOOBE>true</HideWirelessSetupInOOBE>
        <ProtectYourPC>3</ProtectYourPC>
      </OOBE>
`
    : ''
  return `<?xml version="1.0" encoding="utf-8"?>
<unattend xmlns="urn:schemas-microsoft-com:unattend">
  <settings pass="windowsPE">
    <component name="Microsoft-Windows-International-Core-WinPE" processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS">
      <SetupUILanguage>
        <UILanguage>${escaparXml(c.locale)}</UILanguage>
      </SetupUILanguage>
      <InputLocale>${escaparXml(c.locale)}</InputLocale>
      <SystemLocale>${escaparXml(c.locale)}</SystemLocale>
      <UILanguage>${escaparXml(c.locale)}</UILanguage>
      <UserLocale>${escaparXml(c.locale)}</UserLocale>
    </component>
    <component name="Microsoft-Windows-Setup" processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS">
      <UserData>
        <AcceptEula>${c.aceitarEula ? 'true' : 'false'}</AcceptEula>
      </UserData>
    </component>
  </settings>
  <settings pass="oobeSystem">
    <component name="Microsoft-Windows-Shell-Setup" processorArchitecture="amd64" publicKeyToken="31bf3856ad364e35" language="neutral" versionScope="nonSxS">
${oobe}      <ComputerName>${escaparXml(c.nomePc)}</ComputerName>
      <TimeZone>${escaparXml(c.fusoHorario)}</TimeZone>
    </component>
  </settings>
</unattend>
`
}

/** sources/ei.cfg: escolhe canal/edição em instaladores Windows antigos sem essa tela. */
export function construirEiCfg(o: OpcoesUnattend = {}): string {
  const c = opcoesSanitizadas(o)
  return `[EditionID]
${c.edicao}
[Channel]
${c.canal}
[VL]
${c.canal === 'Volume' ? 1 : 0}
`
}

/** Escreve autounattend.xml e sources/ei.cfg na pasta de personalização. */
export function gerarUnattend(raiz: string, o: OpcoesUnattend = {}): RespostaMidia {
  const overlay = criarPastaOverlay(raiz)
  const xml = join(overlay.caminho, 'autounattend.xml')
  const sources = join(overlay.caminho, 'sources')
  const ei = join(sources, 'ei.cfg')
  writeFileSync(xml, construirUnattend(o), 'utf8')
  mkdirSync(sources, { recursive: true })
  writeFileSync(ei, construirEiCfg(o), 'utf8')
  return {
    ok: true,
    caminho: overlay.caminho,
    caminhoRel: overlay.caminhoRel,
    detalhes: {
      arquivos: [caminhoRelativo(raiz, xml), caminhoRelativo(raiz, ei)],
      edicao: opcoesSanitizadas(o).edicao
    },
    aviso: 'arquivos criados na pasta de personalização — use "Reconstruir ISO personalizada" para aplicar na imagem'
  }
}

// ---------------------------------------------------------------- presets

const PRESET_RE = /^[a-z0-9][a-z0-9-]{0,39}$/

function pastaPresets(raiz: string): string {
  const p = join(pastaImagens(raiz), 'presets')
  mkdirSync(p, { recursive: true })
  return p
}

export function idPreset(nome: string): string | null {
  if (!String(nome || '').trim()) return null
  const id = slug(nome, 40)
  return id && PRESET_RE.test(id) ? id : null
}

function contarArquivos(dir: string): number {
  let total = 0
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    if (item.isDirectory()) total += contarArquivos(join(dir, item.name))
    else total += 1
  }
  return total
}

export type PresetPersonalizacao = { id: string; caminhoRel: string; arquivos: number; atualizadoEm: string }

export function listarPresets(raiz: string): { ok: boolean; itens: PresetPersonalizacao[]; erro?: string } {
  try {
    const base = pastaPresets(raiz)
    const itens: PresetPersonalizacao[] = []
    for (const item of readdirSync(base, { withFileTypes: true })) {
      if (!item.isDirectory() || !PRESET_RE.test(item.name)) continue
      const abs = join(base, item.name)
      itens.push({
        id: item.name,
        caminhoRel: caminhoRelativo(raiz, abs),
        arquivos: contarArquivos(abs),
        atualizadoEm: statSync(abs).mtime.toISOString()
      })
    }
    itens.sort((a, b) => a.id.localeCompare(b.id))
    return { ok: true, itens }
  } catch (e) {
    return { ok: false, itens: [], erro: String(e instanceof Error ? e.message : e) }
  }
}

/** Copia a pasta de personalização atual para um preset nomeado. */
export function salvarPreset(raiz: string, nome: string): RespostaMidia {
  const id = idPreset(nome)
  if (!id) return { ok: false, erro: 'nome do preset inválido — use letras, números e hífen' }
  const overlay = criarPastaOverlay(raiz)
  const arquivos = contarArquivos(overlay.caminho)
  if (!arquivos) return { ok: false, erro: 'a pasta de personalização está vazia — adicione arquivos antes de salvar o preset' }
  const destino = join(pastaPresets(raiz), id)
  rmSync(destino, { recursive: true, force: true })
  cpSync(overlay.caminho, destino, { recursive: true })
  return {
    ok: true,
    caminho: destino,
    caminhoRel: caminhoRelativo(raiz, destino),
    detalhes: { id, arquivos }
  }
}

/** Mescla um preset dentro da pasta de personalização (sobrescreve arquivos iguais). */
export function aplicarPreset(raiz: string, nome: string): RespostaMidia {
  const id = idPreset(nome)
  if (!id) return { ok: false, erro: 'nome do preset inválido' }
  const origem = join(pastaPresets(raiz), id)
  if (!existsSync(origem)) return { ok: false, erro: 'preset não encontrado: ' + id }
  const overlay = criarPastaOverlay(raiz)
  cpSync(origem, overlay.caminho, { recursive: true, force: true })
  return {
    ok: true,
    caminho: overlay.caminho,
    caminhoRel: overlay.caminhoRel,
    detalhes: { id, arquivos: contarArquivos(origem) },
    aviso: 'preset aplicado — reconstrua a ISO para gerar a imagem final'
  }
}

function validarImagem(entrada: string): string | null {
  if (!entrada || !entrada.trim()) return 'informe a imagem'
  if (!existsSync(entrada)) return 'imagem não encontrada: ' + entrada
  let st: ReturnType<typeof statSync>
  try {
    st = statSync(entrada)
  } catch {
    return 'imagem inacessível: ' + entrada
  }
  if (!st.isFile()) return 'o caminho não é um arquivo: ' + entrada
  if (!/\.(iso|img|dmg)$/i.test(entrada)) return 'formato não suportado (use ISO, IMG ou DMG)'
  return null
}

export async function extrairIso(
  raiz: string,
  opts: { entrada: string; saida?: string }
): Promise<RespostaMidia> {
  const bloqueio = validarImagem(opts.entrada)
  if (bloqueio) return { ok: false, erro: bloqueio }
  if (extname(opts.entrada).toLowerCase() === '.dmg') {
    return { ok: false, erro: 'DMG não é suportado para extração local; use a análise e, se tiver 7-Zip, extraia manualmente' }
  }
  const destino = destinoArquivo(raiz, nomeArquivo('iso-extraido', ''), opts.saida)
  mkdirSync(destino, { recursive: true })
  const inicio = Date.now()
  let detalhes: Record<string, unknown> = {}
  const suporte = await suporteIso()
  if (suporte.ok) {
    const r = await executarPython(['-c', SCRIPT_PY, 'extrair', opts.entrada, destino], 2 * 60 * 60 * 1000)
    const json = lerJson(r.stdout)
    if (!r.ok || !json || json.ok !== true) {
      rmSync(destino, { recursive: true, force: true })
      return {
        ok: false,
        erro: String(json?.erro || (r.erro || r.stderr || 'falha ao extrair a ISO').slice(0, 400))
      }
    }
    detalhes = json
  } else {
    const montagem = await extrairViaMontagem(opts.entrada, destino)
    if (!montagem.ok) {
      rmSync(destino, { recursive: true, force: true })
      return { ok: false, erro: montagem.erro || 'extração indisponível', aviso: 'instale o suporte pycdlib na caixa de imagens' }
    }
    detalhes = { via: 'Mount-DiskImage' }
  }
  return {
    ok: true,
    caminho: destino,
    caminhoRel: caminhoRelativo(raiz, destino),
    detalhes: { ...detalhes, segundos: Math.round((Date.now() - inicio) / 1000) },
    aviso: 'conteúdo extraído — edite os arquivos e use "Reconstruir ISO" para gerar a imagem personalizada'
  }
}

async function extrairViaMontagem(entrada: string, destino: string): Promise<{ ok: boolean; erro?: string }> {
  if (process.platform !== 'win32') return { ok: false, erro: 'extração sem pycdlib requer Windows' }
  const dir = mkdtempSync(join(tmpdir(), 'dg-montar-'))
  const script = join(dir, 'montar.ps1')
  writeFileSync(script, SCRIPT_MONTAR, 'utf8')
  const r = await rodar(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-Image', entrada, '-Dest', destino],
    2 * 60 * 60 * 1000
  )
  if (r.ok && /OK/.test(r.stdout)) return { ok: true }
  const erro = r.stdout.split(/\r?\n/).find((l) => l.startsWith('ERRO '))
  return { ok: false, erro: erro ? erro.slice(5) : (r.erro || r.stderr || 'montagem falhou').slice(0, 300) }
}

export async function reconstruirIso(
  raiz: string,
  opts: { entrada: string; overlay?: string; saida?: string; rotulo?: string }
): Promise<RespostaMidia> {
  const bloqueio = validarImagem(opts.entrada)
  if (bloqueio) return { ok: false, erro: bloqueio }
  if (extname(opts.entrada).toLowerCase() === '.dmg') {
    return { ok: false, erro: 'reconstrução de DMG não é suportada — o foco é ISO de Windows/Linux' }
  }
  const suporte = await suporteIso()
  if (!suporte.ok) return { ok: false, erro: 'instale o suporte a ISO (pycdlib) para reconstruir imagens' }
  const overlay = opts.overlay ? join(opts.overlay) : criarPastaOverlay(raiz).caminho
  if (!existsSync(overlay)) return { ok: false, erro: 'pasta de personalização não encontrada: ' + overlay }
  if (!isInsidePath(overlay, raiz)) {
    return { ok: false, erro: 'a pasta de personalização precisa estar dentro do projeto (use a pasta overlay padrão)' }
  }
  const base = basename(opts.entrada, extname(opts.entrada))
  const destino = destinoArquivo(raiz, base + '-personalizada.iso', opts.saida)
  if (destino === opts.entrada) return { ok: false, erro: 'a saída não pode sobrescrever a imagem original' }
  const inicio = Date.now()
  const r = await executarPython(
    ['-c', SCRIPT_PY, 'reconstruir', opts.entrada, overlay, destino, opts.rotulo || ''],
    2 * 60 * 60 * 1000
  )
  const json = lerJson(r.stdout)
  if (!r.ok || !json || json.ok !== true) {
    return {
      ok: false,
      erro: String(json?.erro || (r.erro || r.stderr || 'falha ao reconstruir a ISO').slice(0, 400))
    }
  }
  const st = statSync(destino)
  const avisos = Array.isArray(json.avisos) ? (json.avisos as unknown[]).map(String) : []
  return {
    ok: true,
    caminho: destino,
    caminhoRel: caminhoRelativo(raiz, destino),
    bytes: st.size,
    mime: 'application/x-iso9660-image',
    detalhes: { ...json, segundos: Math.round((Date.now() - inicio) / 1000) },
    aviso:
      String(json.arquivos) +
      ' arquivo(s), ' +
      String(json.injetados) +
      ' injetado(s)' +
      (avisos.length ? ' · ' + avisos.slice(0, 3).join(' · ') : '')
  }
}

export async function listarConteudoIso(opts: { entrada: string; limite?: number }): Promise<RespostaMidia> {
  const bloqueio = validarImagem(opts.entrada)
  if (bloqueio) return { ok: false, erro: bloqueio }
  const suporte = await suporteIso()
  if (!suporte.ok) return { ok: false, erro: 'instale o suporte a ISO (pycdlib) para listar o conteúdo completo' }
  const limite = Math.max(1, Math.min(2000, Math.round(Number(opts.limite) || 200)))
  const r = await executarPython(['-c', SCRIPT_PY, 'listar', opts.entrada, String(limite)], 120_000)
  const json = lerJson(r.stdout)
  if (!r.ok || !json || json.ok !== true) return { ok: false, erro: String(json?.erro || 'falha ao listar') }
  return { ok: true, detalhes: json }
}
