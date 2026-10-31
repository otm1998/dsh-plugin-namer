/**
 * 插件命名 —— Host 半边（v3：只列第三方安装的插件，deep 自带的一概不进列表）。
 *
 * 数据源：pluginManager.listBundles() ——「插件」页「已安装」读的就是它。
 * 过滤：availability === 'installation'（随 dsh 安装自带，如本地附件存储/插件管理服务等
 *       中文命名的官方插件）默认整条隐藏；只保留 availability === 'profile' 的、
 *       用户自己装进来的第三方插件。config.showBundled 可临时把自带的也放出来。
 *
 * 改名：把名字写进**目标包自己的** locale 元数据（meta.title），
 * 于是「已安装」里显示的就是这个名字，而不是本插件账本里的一个标签。
 *
 * 实测规则：
 *  - 宿主按包 package.json 的 `./locale/*.json` 导出键找语言文件；
 *  - 元数据每次读取现读磁盘，改完刷新页面即可见，不用重启；
 *  - 必须写**无 BOM 的 UTF-8**，带 BOM 会被 JSON.parse 拒掉并静默回退成包名；
 *  - 原本没有语言资源的包，补导出键属于结构变更，运行中的宿主不会重读 exports，
 *    这类改名标记为「待重启生效」；
 *  - 打在 app.asar 内的官方包不可写，只记账（正常已由过滤规则排除）。
 */
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** Loader 行 id。 */
export const name = 'dsh-plugin-namer'

const ROUTE_PREFIX = '/plugin-namer'
const MAX_NAME_LENGTH = 60
const MAX_BODY_BYTES = 64 * 1024
const STATE_VERSION = 3
const REVISION = 3
const LOCALE_EXPORT_KEY = './locale/*.json'
const BACKUP_SUFFIX = '.plugin-namer.bak'

function homeDirectory() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

function profileDirectory() {
  if (process.env.DSH_PROFILE_DIR) return process.env.DSH_PROFILE_DIR
  const profile = process.env.DSH_PROFILE || 'desktop'
  return join(homeDirectory(), 'profiles', profile)
}

function resolveStateFile(config) {
  const configured = config && typeof config.stateFile === 'string' ? config.stateFile.trim() : ''
  if (configured) return configured
  return join(homeDirectory(), 'plugin-namer', 'names.json')
}

function stripBom(text) {
  return typeof text === 'string' && text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

function pickText(value) {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return ''
  for (const key of ['zh', 'zh-CN', 'zh-Hans', 'en']) {
    const candidate = value[key]
    if (typeof candidate === 'string' && candidate.trim()) return candidate
  }
  for (const candidate of Object.values(value)) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate
  }
  return ''
}

function sanitizeName(input) {
  if (typeof input !== 'string') return ''
  const flat = input.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  return flat.slice(0, MAX_NAME_LENGTH)
}

/** 包 manifest 里的作者描述；没有就是空串。 */
function manifestDescription(manifest) {
  return manifest && typeof manifest.description === 'string' ? manifest.description.trim() : ''
}

/** `dsh-purge/redteam` → `dsh-purge`；`@scope/pkg/sub` → `@scope/pkg`。 */
function rootPackageOf(moduleName) {
  const value = String(moduleName || '').trim()
  if (!value) return ''
  const parts = value.split('/')
  if (value.startsWith('@')) return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : ''
  return parts[0]
}

function packageRoots() {
  return [join(profileDirectory(), 'node_modules'), join(homeDirectory(), 'node_modules')]
}

/** 找到可写包的目录；内置在 app.asar 里的包找不到，返回 null。 */
async function locatePackage(packageName) {
  if (!/^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(packageName)) return null
  for (const root of packageRoots()) {
    const dir = join(root, packageName)
    try {
      const text = stripBom(await readFile(join(dir, 'package.json'), 'utf8'))
      const manifest = JSON.parse(text)
      if (manifest && manifest.name === packageName) return { dir, manifest, text }
    } catch {
      // 不存在、不可读、坏 JSON —— 都当这条根下没有这个包
    }
  }
  return null
}

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function readJsonFile(file) {
  const text = stripBom(await readFile(file, 'utf8'))
  return { text, doc: JSON.parse(text) }
}

async function writeTextNoBom(file, text) {
  await mkdir(dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  await writeFile(temporary, stripBom(text), 'utf8')
  await rename(temporary, file)
}

function localeExportValue(manifest) {
  const exportsMap = manifest && typeof manifest.exports === 'object' ? manifest.exports : null
  if (!exportsMap) return ''
  const value = exportsMap[LOCALE_EXPORT_KEY]
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && typeof value.default === 'string') return value.default
  return ''
}

async function localeFiles(dir) {
  const folder = join(dir, 'locale')
  let entries = []
  try {
    entries = await readdir(folder)
  } catch {
    return []
  }
  return entries.filter((file) => file.endsWith('.json')).map((file) => join(folder, file))
}

/** 写名字前的准备：必要时补导出键、必要时建语言文件。 */
async function prepareLocale(dir, manifest, manifestText) {
  const report = { manifestPatched: false, createdFiles: [] }
  const existing = await localeFiles(dir)

  if (existing.length === 0) {
    const folder = join(dir, 'locale')
    await mkdir(folder, { recursive: true })
    for (const locale of ['zh', 'en']) {
      const file = join(folder, `${locale}.json`)
      if (await exists(file)) continue
      // 宿主校验 meta.description 必须是非空字符串：新建文件时就带上作者描述，绝不写空壳
      await writeTextNoBom(
        file,
        `${JSON.stringify({ meta: { title: '', description: manifestDescription(manifest) || '—' } }, null, 2)}\n`,
      )
      report.createdFiles.push(file)
    }
  }

  if (!localeExportValue(manifest)) {
    const manifestFile = join(dir, 'package.json')
    const backup = `${manifestFile}${BACKUP_SUFFIX}`
    if (!(await exists(backup))) await writeTextNoBom(backup, manifestText)
    const exportsMap = manifest.exports && typeof manifest.exports === 'object' ? manifest.exports : {}
    const next = { ...manifest, exports: { ...exportsMap, [LOCALE_EXPORT_KEY]: LOCALE_EXPORT_KEY } }
    await writeTextNoBom(manifestFile, `${JSON.stringify(next, null, 2)}\n`)
    report.manifestPatched = true
  }

  return report
}

/** 把 custom 写进该包每个 locale 文件的 meta.title。 */
async function applyTitle(dir, manifest, manifestText, custom) {
  const preparation = await prepareLocale(dir, manifest, manifestText)
  const files = await localeFiles(dir)
  const touched = []
  for (const file of files) {
    let parsed
    try {
      parsed = await readJsonFile(file)
    } catch {
      continue // 坏文件不碰
    }
    const doc = parsed.doc && typeof parsed.doc === 'object' ? parsed.doc : {}
    const meta = doc.meta && typeof doc.meta === 'object' ? doc.meta : {}
    const fresh = preparation.createdFiles.includes(file)
    if (typeof meta.title !== 'string' && !fresh) continue
    const backup = `${file}${BACKUP_SUFFIX}`
    if (!(await exists(backup))) await writeTextNoBom(backup, parsed.text)
    const nextMeta = { ...meta, title: custom }
    // 作者描述为空也会让宿主判为包元信息错误，必须补成非空
    if (typeof nextMeta.description !== 'string' || !nextMeta.description.trim()) {
      nextMeta.description = manifestDescription(manifest) || custom || '—'
    }
    const next = { ...doc, meta: nextMeta }
    await writeTextNoBom(file, `${JSON.stringify(next, null, 2)}\n`)
    touched.push(file)
  }
  return { ...preparation, files: touched, requiresRestart: preparation.manifestPatched }
}

/**
 * 还原。
 * - 原本就有 locale 的包：按 .bak 逐字还原，连 package.json 一起还回去。
 * - 原本没有 locale 的包（createdFiles 非空）：没有"原标题"可还原，就写回一份
 *   「不改名」的合法等价物（title=包名、description=作者描述）并保留导出键。
 *   理由：宿主会把 locale 路径记在内存里，直接把目录删掉会让它 ENOENT 报
 *   「包元信息错误」，直到重启才散。
 */
async function restoreTitle(dir, manifest, createdFiles, packageName) {
  const restored = []
  const created = new Set(Array.isArray(createdFiles) ? createdFiles.filter(Boolean) : [])

  if (created.size) {
    const description = manifestDescription(manifest) || packageName
    for (const file of created) {
      if (!(await exists(file))) continue
      await writeTextNoBom(file, `${JSON.stringify({ meta: { title: packageName, description } }, null, 2)}\n`)
      const backup = `${file}${BACKUP_SUFFIX}`
      if (await exists(backup)) await unlink(backup)
    }
    return { restored, manifestRestored: false, keptExport: true }
  }

  for (const file of await localeFiles(dir)) {
    const backup = `${file}${BACKUP_SUFFIX}`
    if (!(await exists(backup))) continue
    const original = await readFile(backup, 'utf8')
    await writeTextNoBom(file, original)
    await unlink(backup)
    restored.push(file)
  }
  const manifestFile = join(dir, 'package.json')
  const manifestBackup = `${manifestFile}${BACKUP_SUFFIX}`
  let manifestRestored = false
  if (await exists(manifestBackup)) {
    const original = await readFile(manifestBackup, 'utf8')
    await writeTextNoBom(manifestFile, original)
    await unlink(manifestBackup)
    manifestRestored = true
  }
  return { restored, manifestRestored }
}

/**
 * 自愈：把 locale 里空的 meta.description / meta.title 补成合法值。
 * 早期版本新建语言文件时把 description 写成空串，宿主会判「包元信息错误」；
 * 这里按包 manifest 的作者描述补回去，不动 title 已有值。
 */
async function repairPackage(packageName, record) {
  const located = await locatePackage(packageName)
  if (!located) return { packageName, ok: false, fixed: [], error: '包目录不可写' }
  const fallbackDescription = manifestDescription(located.manifest) || (record && record.title) || packageName
  const fallbackTitle = sanitizeName((record && record.title) || '')
  const fixed = []
  for (const file of await localeFiles(located.dir)) {
    let parsed
    try {
      parsed = await readJsonFile(file)
    } catch {
      continue
    }
    const doc = parsed.doc && typeof parsed.doc === 'object' ? parsed.doc : {}
    const meta = doc.meta && typeof doc.meta === 'object' ? { ...doc.meta } : {}
    let changed = false
    if (typeof meta.description !== 'string' || !meta.description.trim()) {
      meta.description = fallbackDescription
      changed = true
    }
    if ((typeof meta.title !== 'string' || !meta.title.trim()) && fallbackTitle) {
      meta.title = fallbackTitle
      changed = true
    }
    if (!changed) continue
    await writeTextNoBom(file, `${JSON.stringify({ ...doc, meta }, null, 2)}\n`)
    fixed.push(file)
  }
  return { packageName, ok: true, fixed }
}

async function loadState(file) {
  try {
    const text = stripBom(await readFile(file, 'utf8'))
    const parsed = JSON.parse(text)
    const names = parsed && typeof parsed.names === 'object' && parsed.names ? parsed.names : {}
    const packages = parsed && typeof parsed.packages === 'object' && parsed.packages ? parsed.packages : {}
    const cleanNames = {}
    for (const [key, value] of Object.entries(names)) {
      const clean = sanitizeName(value)
      if (key && clean) cleanNames[key] = clean
    }
    return { names: cleanNames, packages }
  } catch {
    return { names: {}, packages: {} }
  }
}

async function saveState(file, state) {
  await mkdir(dirname(file), { recursive: true })
  const payload = `${JSON.stringify({ version: STATE_VERSION, names: state.names, packages: state.packages }, null, 2)}\n`
  const temporary = `${file}.${process.pid}.tmp`
  await writeFile(temporary, payload, 'utf8')
  await rename(temporary, file)
}

function isLoopbackRequest(req) {
  const address = String(req?.socket?.remoteAddress || '')
  const local = address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1' || address === ''
  if (!local) return false
  const host = String(req?.headers?.host || '')
  if (!host) return true
  return /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(host)
}

async function readJsonBody(req) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buffer.length
    if (total > MAX_BODY_BYTES) throw new Error('请求体过大')
    chunks.push(buffer)
  }
  if (!chunks.length) return {}
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return value && typeof value === 'object' ? value : {}
  } catch {
    throw new Error('请求体不是合法 JSON')
  }
}

/**
 * 读已安装 bundle 清单，只留第三方安装的；顺带标出可写性。
 * @param manager pluginManager
 * @param state 本地账本
 * @param showBundled true = 连 deep 自带的也列出来
 */
async function collectBundles(manager, state, showBundled) {
  const bundles = []
  const summary = { total: 0, hiddenBundled: 0, thirdParty: 0, error: '' }
  if (!manager || typeof manager.listBundles !== 'function') {
    return { bundles, summary: { ...summary, error: 'pluginManager 服务当前不可用' } }
  }
  let rows = []
  try {
    rows = await manager.listBundles()
  } catch (failure) {
    return { bundles, summary: { ...summary, error: String(failure?.message ?? failure) } }
  }
  const writable = new Map()
  for (const raw of Array.isArray(rows) ? rows : []) {
    const packageName = String(raw?.name || '').trim()
    if (!packageName) continue
    summary.total += 1
    const bundled = raw?.availability === 'installation'
    // deep 自带的一律不进列表：它们中文名就是官方写好的，不需要也不该被改名
    if (bundled && !showBundled) {
      summary.hiddenBundled += 1
      continue
    }
    if (raw?.availability === 'missing') continue
    summary.thirdParty += 1
    if (!writable.has(packageName)) writable.set(packageName, Boolean(await locatePackage(packageName)))
    const record = state.packages?.[packageName] || null
    const custom = sanitizeName(state.names[packageName] ?? '')
    const hostTitle = pickText(raw?.meta?.title)
    const shown = Boolean(custom) && hostTitle === custom
    bundles.push({
      key: packageName,
      packageName,
      title: hostTitle || packageName,
      description: pickText(raw?.meta?.description) || String(raw?.description || ''),
      metaError: String(raw?.meta?.error || ''),
      version: String(raw?.version || ''),
      origin: bundled ? 'bundled' : 'profile',
      official: raw?.official === true,
      removable: raw?.removable === true,
      enabled: raw?.enabled !== false,
      rows: Array.isArray(raw?.rows) ? raw.rows.length : 0,
      writable: Boolean(writable.get(packageName)),
      custom,
      // 宿主读到的标题已经等于自定义名 = 真的改名生效了
      applied: shown,
      // 补过导出键、但宿主还没读到自定义名 = 结构变更待生效（重启后会自动消失）
      pendingRestart: Boolean(record && record.manifestPatched && custom && !shown),
    })
  }
  bundles.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'))
  return { bundles, summary }
}

/**
 * Host 插件入口。
 * @param ctx Cordis Host 上下文。
 * @param config 行配置；支持 { stateFile, showBundled }。
 */
export function apply(ctx, config) {
  const stateFile = resolveStateFile(config)
  const showBundled = Boolean(config && config.showBundled)

  ctx.inject(['webServer'], (host) => {
    host.effect(() => {
      const send = (res, status, body) => {
        res.writeHead(status, {
          'cache-control': 'no-store',
          'content-type': 'application/json; charset=utf-8',
        })
        res.end(JSON.stringify(body))
      }

      const snapshot = async () => {
        const state = await loadState(stateFile)
        const { bundles, summary } = await collectBundles(host.get('pluginManager'), state, showBundled)
        return {
          ok: true,
          revision: REVISION,
          stateFile,
          showBundled,
          named: bundles.filter((bundle) => bundle.custom).length,
          summary,
          bundles,
        }
      }

      const stopState = host.webServer.register({
        name: 'plugin-namer-state',
        kind: 'exact',
        path: `${ROUTE_PREFIX}/state`,
        handler: async (req, res) => {
          if (!isLoopbackRequest(req)) {
            send(res, 403, { ok: false, error: '仅限本机访问' })
            return
          }
          if ((req.method || 'GET') !== 'GET') {
            res.writeHead(405, { allow: 'GET' }).end()
            return
          }
          try {
            send(res, 200, await snapshot())
          } catch (failure) {
            send(res, 500, { ok: false, error: String(failure?.message ?? failure) })
          }
        },
      }, 'plugin-namer: state')

      const stopRename = host.webServer.register({
        name: 'plugin-namer-rename',
        kind: 'exact',
        path: `${ROUTE_PREFIX}/rename`,
        handler: async (req, res) => {
          if (!isLoopbackRequest(req)) {
            send(res, 403, { ok: false, error: '仅限本机访问' })
            return
          }
          if (req.method !== 'POST') {
            res.writeHead(405, { allow: 'POST' }).end()
            return
          }
          try {
            const body = await readJsonBody(req)
            const packageName = rootPackageOf(
              String(body?.packageName || body?.bundle || body?.moduleName || '').trim(),
            )
            if (!packageName) {
              send(res, 400, { ok: false, error: '缺少插件包名' })
              return
            }
            const custom = sanitizeName(body?.title ?? body?.name ?? '')
            const state = await loadState(stateFile)
            const located = await locatePackage(packageName)

            let effect = { mode: 'ledger', files: [], manifestPatched: false, error: '' }
            if (located) {
              try {
                if (!custom) {
                  const record = state.packages?.[packageName] || {}
                  const restored = await restoreTitle(located.dir, located.manifest, record.createdFiles, packageName)
                  delete state.packages[packageName]
                  effect = {
                    mode: 'restored',
                    files: restored.restored,
                    manifestPatched: restored.manifestRestored,
                    error: '',
                  }
                } else {
                  const written = await applyTitle(located.dir, located.manifest, located.text, custom)
                  state.packages[packageName] = {
                    title: custom,
                    dir: located.dir,
                    files: written.files,
                    createdFiles: written.createdFiles,
                    manifestPatched: written.manifestPatched,
                    at: new Date().toISOString(),
                  }
                  effect = {
                    mode: written.requiresRestart ? 'metadata-restart' : 'metadata',
                    files: written.files,
                    manifestPatched: written.manifestPatched,
                    requiresRestart: written.requiresRestart,
                    error: '',
                  }
                }
              } catch (failure) {
                effect = { mode: 'ledger', files: [], manifestPatched: false, error: String(failure?.message ?? failure) }
              }
            } else {
              effect.error = '包目录不可写（内置包），只记账'
            }

            if (!custom) delete state.names[packageName]
            else state.names[packageName] = custom
            await saveState(stateFile, state)

            const payload = await snapshot()
            send(res, 200, { ok: true, packageName, title: custom, effect, saved: payload })
          } catch (failure) {
            send(res, 500, { ok: false, error: String(failure?.message ?? failure) })
          }
        },
      }, 'plugin-namer: rename')

      const stopRepair = host.webServer.register({
        name: 'plugin-namer-repair',
        kind: 'exact',
        path: `${ROUTE_PREFIX}/repair`,
        handler: async (req, res) => {
          if (!isLoopbackRequest(req)) {
            send(res, 403, { ok: false, error: '仅限本机访问' })
            return
          }
          if (req.method !== 'POST') {
            res.writeHead(405, { allow: 'POST' }).end()
            return
          }
          try {
            const body = await readJsonBody(req)
            const state = await loadState(stateFile)
            const requested = typeof body?.packageName === 'string' ? rootPackageOf(body.packageName.trim()) : ''
            const targets = requested ? [requested] : Object.keys(state.packages || {})
            const results = []
            for (const name of targets) results.push(await repairPackage(name, state.packages?.[name]))
            send(res, 200, {
              ok: true,
              repaired: results.filter((item) => item.fixed.length).length,
              results,
              saved: await snapshot(),
            })
          } catch (failure) {
            send(res, 500, { ok: false, error: String(failure?.message ?? failure) })
          }
        },
      }, 'plugin-namer: repair')

      return () => {
        stopState()
        stopRename()
        stopRepair()
      }
    }, 'plugin-namer: local routes')
  })
}
