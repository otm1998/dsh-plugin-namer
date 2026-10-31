// 插件命名 —— Client 半边（v3）。
// 手写 __ModuleLoader__ 懒加载工厂：在「插件」页挂一个「命名」标签页，
// 只列用户自己装的第三方插件，给它们写真正生效的显示名。
window.__ModuleLoader__.load({
  id: 'dsh-plugin-namer',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useState } = React

    const NS = 'plugin-namer'
    const STATE_URL = '/plugin-namer/state'
    const RENAME_URL = '/plugin-namer/rename'

    const DICT = {
      zh: {
        nav: '命名',
        title: '插件命名',
        subtitle: '只列你自己安装的第三方插件。dsh 自带的官方插件不进这个列表——它们的名字是官方写好的，不用改。',
        search: '搜索插件名或包名…',
        refresh: '刷新',
        save: '保存',
        clear: '清除',
        loading: '正在读取已安装插件…',
        empty: '没有读到第三方插件。装一个插件后刷新。',
        noMatch: '没有匹配的插件。',
        shown: '第三方插件',
        named: '已命名',
        hidden: '已隐藏自带',
        custom: '自定义',
        self: '本插件',
        version: '版本',
        rowsLabel: '行',
        saved: '已保存',
        restored: '已还原原名',
        saveFailed: '保存失败',
        loadFailed: '读取失败',
        storage: '账本文件',
        namePlaceholder: '起个名字，例如「小甜甜」',
        applied: '已写入元数据',
        ledgerOnly: '只读包·仅记账',
        writeFailed: '写入元数据失败，只记了账',
        refreshHint: '刷新页面，「已安装」列表里的名字就变了',
        pendingRestart: '待重启生效',
        savedRestart: '已写入。这个包原本没有标题资源，需重启 dsh 才会显示新名字',
        more: '展开',
        less: '收起',
        descMissing: '这个插件没有写自我介绍',
      },
      en: {
        nav: 'Naming',
        title: 'Plugin Naming',
        subtitle: 'Only third-party plugins you installed are listed. Bundled DeepSeek plugins stay out — their names are official.',
        search: 'Search by name or package…',
        refresh: 'Refresh',
        save: 'Save',
        clear: 'Clear',
        loading: 'Reading installed plugins…',
        empty: 'No third-party plugins found. Install one, then refresh.',
        noMatch: 'No plugin matches.',
        shown: 'third-party',
        named: 'named',
        hidden: 'bundled hidden',
        custom: 'custom',
        self: 'this plugin',
        version: 'version',
        rowsLabel: 'rows',
        saved: 'Saved',
        restored: 'Original name restored',
        saveFailed: 'Save failed',
        loadFailed: 'Load failed',
        storage: 'Ledger',
        namePlaceholder: 'Type a name, e.g. Little Sweetie',
        applied: 'written to metadata',
        ledgerOnly: 'read-only · ledger only',
        writeFailed: 'metadata write failed, ledger only',
        refreshHint: 'Refresh the page to see the new name in the installed list',
        pendingRestart: 'applies after restart',
        savedRestart: 'Written. This package had no locale metadata; restart dsh to see the new name',
        more: 'more',
        less: 'less',
        descMissing: 'This plugin ships no description',
      },
    }

    const T = {
      ink: 'var(--dsw-alias-label-primary, #e5e7eb)',
      muted: 'var(--dsw-alias-label-tertiary, #9ca3af)',
      dim: 'var(--dsw-alias-label-dimmed, #6b7280)',
      border: 'var(--dsw-alias-border-l2, rgba(128,128,128,.25))',
      panel: 'var(--dsw-alias-bg-layer-3, rgba(255,255,255,.035))',
      panel2: 'var(--dsw-alias-bg-layer-2, rgba(255,255,255,.06))',
      accent: 'var(--dsw-alias-brand-primary, #4d9cff)',
      danger: 'var(--dsw-alias-state-error-primary, #ef6b73)',
      ok: 'var(--dsw-alias-state-success-primary, #3fb950)',
    }

    const PAGE = {
      width: '100%',
      maxWidth: '880px',
      display: 'flex',
      flexDirection: 'column',
      gap: '14px',
      color: T.ink,
      fontFamily: 'inherit',
      fontSize: '13px',
    }
    const ROW = { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }
    const INPUT = {
      flex: '1 1 180px',
      minWidth: '140px',
      padding: '8px 10px',
      fontSize: '13px',
      boxSizing: 'border-box',
      background: T.panel2,
      color: T.ink,
      border: `1px solid ${T.border}`,
      borderRadius: '8px',
      outline: 'none',
    }
    const GHOST = {
      padding: '7px 12px',
      borderRadius: '8px',
      border: `1px solid ${T.border}`,
      background: 'transparent',
      color: T.ink,
      fontSize: '12px',
      fontWeight: 500,
      cursor: 'pointer',
    }
    const PRIMARY = {
      padding: '7px 13px',
      borderRadius: '8px',
      border: '1px solid transparent',
      background: T.accent,
      color: '#fff',
      fontSize: '12px',
      fontWeight: 600,
      cursor: 'pointer',
    }
    const CARD = {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      flexWrap: 'wrap',
      padding: '11px 13px',
      borderRadius: '10px',
      border: `1px solid ${T.border}`,
      background: T.panel,
    }
    const CHIP = {
      padding: '1px 7px',
      borderRadius: '999px',
      border: `1px solid ${T.border}`,
      fontSize: '11px',
      color: T.muted,
    }

    function bundleKey(bundle) {
      return bundle.key || bundle.packageName
    }

    function NamerPanel(props) {
      const t = props.t || ((key) => key)
      const [state, setState] = useState({ status: 'loading', bundles: [], named: 0, summary: {}, stateFile: '', error: '' })
      const [drafts, setDrafts] = useState({})
      const [busyKey, setBusyKey] = useState('')
      const [notice, setNotice] = useState({ kind: 'idle', text: '' })
      const [query, setQuery] = useState('')
      const [expanded, setExpanded] = useState({})

      const toggleExpanded = useCallback((key) => {
        setExpanded((current) => ({ ...current, [key]: !current[key] }))
      }, [])

      const adopt = useCallback((payload) => {
        const bundles = Array.isArray(payload?.bundles) ? payload.bundles : []
        setState({
          status: 'ready',
          bundles,
          named: typeof payload?.named === 'number' ? payload.named : bundles.filter((b) => b.custom).length,
          summary: payload?.summary && typeof payload.summary === 'object' ? payload.summary : {},
          stateFile: typeof payload?.stateFile === 'string' ? payload.stateFile : '',
          error: typeof payload?.error === 'string' ? payload.error : '',
        })
        setDrafts((current) => {
          const next = {}
          for (const bundle of bundles) {
            const key = bundleKey(bundle)
            next[key] = key in current ? current[key] : bundle.custom || ''
          }
          return next
        })
      }, [])

      const load = useCallback(() => {
        fetch(STATE_URL, { cache: 'no-store' })
          .then((response) => response.json())
          .then((payload) => {
            if (!payload || payload.ok !== true) throw new Error(payload?.error || 'state failed')
            adopt(payload)
          })
          .catch((error) => {
            setState((current) => ({ ...current, status: 'failed', error: String(error?.message || error) }))
            setNotice({ kind: 'error', text: `${t('loadFailed')}: ${String(error?.message || error)}` })
          })
      }, [adopt, t])

      useEffect(() => {
        load()
      }, [load])

      const commit = useCallback(
        (bundle, title) => {
          const key = bundleKey(bundle)
          setBusyKey(key)
          setNotice({ kind: 'idle', text: '' })
          fetch(RENAME_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ packageName: bundle.packageName, title }),
          })
            .then((response) => response.json())
            .then((payload) => {
              if (!payload || payload.ok !== true) throw new Error(payload?.error || 'rename failed')
              if (payload.saved) adopt(payload.saved)
              const applied = typeof payload.title === 'string' ? payload.title : ''
              const effect = payload.effect || {}
              if (!applied) {
                setNotice({ kind: 'ok', text: `${t('restored')} · ${bundle.title}` })
              } else if (effect.mode === 'metadata') {
                setNotice({ kind: 'ok', text: `${t('saved')} · ${t('refreshHint')}` })
              } else if (effect.mode === 'metadata-restart') {
                setNotice({ kind: 'ok', text: t('savedRestart') })
              } else {
                setNotice({ kind: 'error', text: `${t('writeFailed')}${effect.error ? `: ${effect.error}` : ''}` })
              }
            })
            .catch((error) => setNotice({ kind: 'error', text: `${t('saveFailed')}: ${String(error?.message || error)}` }))
            .finally(() => setBusyKey(''))
        },
        [adopt, t],
      )

      const visible = useMemo(() => {
        const needle = query.trim().toLowerCase()
        if (!needle) return state.bundles
        return state.bundles.filter((bundle) =>
          `${bundle.title} ${bundle.packageName} ${bundle.custom || ''} ${bundle.description || ''}`
            .toLowerCase()
            .includes(needle),
        )
      }, [query, state.bundles])

      const header = h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
        h('div', { style: { fontSize: '16px', fontWeight: 600 } }, t('title')),
        h('div', { style: { fontSize: '12px', color: T.muted, lineHeight: 1.6 } }, t('subtitle')),
      )

      const hidden = Number(state.summary?.hiddenBundled || 0)
      const toolbar = h(
        'div',
        { style: ROW },
        h('input', {
          style: { ...INPUT, flex: '1 1 220px' },
          value: query,
          placeholder: t('search'),
          spellCheck: false,
          onChange: (event) => setQuery(event.target.value),
        }),
        h(
          'span',
          { style: { fontSize: '12px', color: T.muted } },
          `${t('shown')} ${state.bundles.length} · ${t('named')} ${state.named}${hidden ? ` · ${t('hidden')} ${hidden}` : ''}`,
        ),
        h('button', { style: GHOST, onClick: load }, t('refresh')),
      )

      const noticeLine = notice.kind === 'idle'
        ? null
        : h(
            'div',
            {
              style: {
                fontSize: '12px',
                color: notice.kind === 'error' ? T.danger : T.ok,
                minHeight: '16px',
              },
            },
            notice.text,
          )

      const errorLine = state.error
        ? h('div', { style: { fontSize: '12px', color: T.danger } }, state.error)
        : null

      const rows = visible.map((bundle) => {
        const key = bundleKey(bundle)
        const draft = key in drafts ? drafts[key] : bundle.custom || ''
        const dirty = (draft || '').trim() !== (bundle.custom || '')
        const selfRow = String(bundle.packageName || '').endsWith('plugin-namer')
        const appliedChip = bundle.custom && bundle.applied
          ? h(
              'span',
              {
                style: {
                  ...CHIP,
                  color: bundle.pendingRestart ? T.accent : T.ok,
                  borderColor: bundle.pendingRestart ? T.accent : T.ok,
                },
              },
              bundle.pendingRestart ? t('pendingRestart') : t('applied'),
            )
          : null
        const ledgerChip = bundle.custom && !bundle.applied
          ? h('span', { style: { ...CHIP, color: T.dim } }, t('ledgerOnly'))
          : null
        const meta = [
          bundle.packageName,
          bundle.version ? `v${bundle.version}` : '',
          bundle.rows ? `${bundle.rows} ${t('rowsLabel')}` : '',
        ].filter(Boolean).join(' · ')
        // 插件自己写的自我介绍：默认两行，点击展开全文
        const description = (bundle.description || '').trim()
        const isOpen = Boolean(expanded[key])
        const long = description.length > 72
        const descriptionLine = description
          ? h(
              'div',
              {
                title: isOpen ? undefined : description,
                onClick: long ? () => toggleExpanded(key) : undefined,
                style: {
                  fontSize: '12px',
                  lineHeight: 1.65,
                  color: T.muted,
                  cursor: long ? 'pointer' : 'default',
                  ...(isOpen
                    ? {}
                    : {
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }),
                },
              },
              description,
            )
          : h('div', { style: { fontSize: '12px', color: T.dim, fontStyle: 'italic' } }, t('descMissing'))
        const expandHint = long
          ? h(
              'button',
              {
                onClick: () => toggleExpanded(key),
                style: {
                  alignSelf: 'flex-start',
                  padding: 0,
                  border: 'none',
                  background: 'transparent',
                  color: T.accent,
                  fontSize: '11px',
                  cursor: 'pointer',
                },
              },
              isOpen ? t('less') : t('more'),
            )
          : null
        return h(
          'div',
          { key, style: { ...CARD, flexDirection: 'column', alignItems: 'stretch', gap: '7px' } },
          h(
            'div',
            { style: { ...ROW, gap: '6px' } },
            h('span', { style: { fontWeight: 600 } }, bundle.custom || bundle.title),
            appliedChip,
            ledgerChip,
            selfRow ? h('span', { style: { ...CHIP, color: T.accent, borderColor: T.accent } }, t('self')) : null,
            bundle.enabled === false ? h('span', { style: { ...CHIP, color: T.dim } }, 'off') : null,
          ),
          h('div', { style: { fontSize: '11px', color: T.dim } }, meta),
          descriptionLine,
          bundle.metaError
            ? h('div', { style: { fontSize: '11px', color: T.danger, wordBreak: 'break-word' } }, bundle.metaError)
            : null,
          expandHint,
          h(
            'div',
            { style: { ...ROW, gap: '8px', marginTop: '2px' } },
            h('input', {
              style: INPUT,
              value: draft,
              maxLength: 60,
              placeholder: t('namePlaceholder'),
              spellCheck: false,
              onChange: (event) => {
                const next = event.target.value
                setDrafts((current) => ({ ...current, [key]: next }))
              },
              onKeyDown: (event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  commit(bundle, draft)
                }
              },
            }),
            h(
              'button',
              {
                style: dirty ? PRIMARY : { ...PRIMARY, opacity: 0.55 },
                disabled: busyKey === key,
                onClick: () => commit(bundle, draft),
              },
              busyKey === key ? '…' : t('save'),
            ),
            h(
              'button',
              {
                style: { ...GHOST, color: bundle.custom ? T.danger : T.ink, opacity: bundle.custom ? 1 : 0.5 },
                disabled: busyKey === key || !bundle.custom,
                onClick: () => commit(bundle, ''),
              },
              t('clear'),
            ),
          ),
        )
      })

      const body = state.status === 'loading'
        ? h('div', { style: { color: T.muted, fontSize: '12px' } }, t('loading'))
        : rows.length
          ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, rows)
          : h('div', { style: { color: T.muted, fontSize: '12px' } }, query.trim() ? t('noMatch') : t('empty'))

      const footer = state.stateFile
        ? h('div', { style: { fontSize: '11px', color: T.dim, wordBreak: 'break-all' } }, `${t('storage')}: ${state.stateFile}`)
        : null

      return h('div', { style: PAGE }, header, toolbar, errorLine, noticeLine, body, footer)
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, DICT), 'plugin-namer: dictionaries')
      const t = ctx.locale.bind(NS)
      const Panel = () => h(NamerPanel, { t })
      const seat = (slot, order) =>
        ctx.slots.inject(slot, () =>
          ctx.slots.register({ name: slot, id: 'plugin-namer', order, label: () => t('nav'), locale: NS }, Panel),
        )
      seat('plugins.tab', 35)
      seat('settings.plugins.tab', 35)
    }

    return {
      name: 'dsh-plugin-namer',
      inject: ['slots', 'locale'],
      apply,
      NamerPanel,
    }
  },
})
