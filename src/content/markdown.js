/**
 * Markdown parser.
 *
 * ## Why this is hand-written
 *
 * The framework ships no runtime dependencies, and the usual reason to break
 * that rule here — "a hand-rolled parser is an XSS risk" — has it backwards.
 * CommonMark *requires* raw HTML to pass through verbatim; 64 of the spec's 652
 * cases exist to pin that behaviour down. That is why every off-the-shelf parser
 * tells you to sanitize its output: the hazard is in the mandate, not in the
 * implementation quality.
 *
 * This parser does not implement those 64 cases, deliberately. It escapes
 * everything it reads and emits only tags from its own vocabulary, so the output
 * is safe by construction: there is no code path by which a byte of input
 * becomes a tag. `sanitizeHtml` still runs over the result, but as a second
 * layer rather than the only one.
 *
 * What the dependency would have bought is CommonMark *correctness*, and the
 * pass rate against the real spec suite is recorded in `markdown.test.js` —
 * measured, not asserted.
 *
 * ## Shape
 *
 * Two passes, as CommonMark itself is structured. Blocks first, since block
 * structure is determined by line prefixes and can be found without looking at
 * inline content. Then inlines within each block's text, where emphasis needs
 * the delimiter-stack algorithm to resolve nesting the way readers expect.
 */

import { escapeHtml, decodeEntities, isSafeUrl, prefixFragmentLinks, DEFAULT_ALLOWED_SCHEMES, DEFAULT_ID_PREFIX } from './sanitize.js'

const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/
const THEMATIC = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/
const FENCE = /^( {0,3})(`{3,}|~{3,})[ \t]*(.*)$/
const BULLET = /^( {0,3})([-+*])([ \t]+|$)/
const ORDERED = /^( {0,3})(\d{1,9})([.)])([ \t]+|$)/
const BLOCKQUOTE = /^ {0,3}>[ ]?/
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/
const TABLE_DELIM = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/

/*
 * Resource bounds.
 *
 * Markdown arrives from users, so every scan here has to be bounded by the
 * input, not by the input squared, and no recursion may follow the input's
 * nesting unchecked. Before these, `'[a]('.repeat(40000)` took three and a half
 * seconds and `'>'.repeat(20000)` overflowed the stack — either one a way to
 * stall or crash a render endpoint with a single request.
 *
 * The limits sit far beyond anything a document written by a person contains,
 * and past them the construct degrades to text rather than failing.
 */

/** Deepest blockquote/list nesting parsed as structure; deeper is text. */
const MAX_BLOCK_DEPTH = 100

/** Deepest inline nesting (emphasis, links) rendered as markup; deeper is text. */
const MAX_INLINE_DEPTH = 100

/**
 * Unescaped parentheses a link destination may nest. commonmark.js uses the
 * same bound; without one, every `](` re-scans the rest of the paragraph.
 */
const MAX_LINK_PAREN_DEPTH = 32

/** CommonMark caps link labels at 999 characters. */
const MAX_LABEL_LENGTH = 999

/**
 * Lines one reference definition may span. The spec sets none, but a label,
 * destination and title that need more than this are not a definition anyone
 * wrote, and without a bound every line re-joins the rest of its paragraph.
 */
const MAX_DEFINITION_LINES = 64

/**
 * Render Markdown to HTML.
 *
 * @param {string} source
 * @param {Object} [options]
 * @param {string[]} [options.schemes] - URL schemes permitted in links/images
 * @param {boolean} [options.headingIds] - add `id` to headings for anchors
 * @param {(text: string) => string} [options.slugify]
 * @param {string} [options.idPrefix] - prepended to heading ids; defaults to
 *   `user-content-` (the sanitizer's prefix, so ids survive it unchanged), `''`
 *   for bare slugs. `[x](#slug)` links to a heading are rewritten to match.
 * @returns {string} HTML. Contains only tags this module emits.
 */
export function renderMarkdown(source, options = {}) {
  if (source === null || source === undefined) return ''

  const context = {
    schemes: options.schemes || DEFAULT_ALLOWED_SCHEMES,
    headingIds: options.headingIds !== false,
    slugify: options.slugify || defaultSlugify,
    idPrefix: options.idPrefix ?? DEFAULT_ID_PREFIX,
    emittedIds: new Set(),
    refs: Object.create(null),
    usedIds: new Set(),
    idCounters: new Map()
  }

  const lines = preprocess(String(source))
  const withoutRefs = extractReferenceDefinitions(lines, context.refs)
  const blocks = parseBlocks(withoutRefs)

  return prefixFragmentLinks(renderBlocks(blocks, context), context.emittedIds, context.idPrefix)
}

/** Normalize line endings and expand tabs to four-column stops. */
function preprocess(source) {
  return source
    .replace(/\r\n?/g, '\n')
    .replace(/\0/g, '�')
    .split('\n')
    .map(expandTabs)
}

function expandTabs(line) {
  if (!line.includes('\t')) return line

  let out = ''
  for (const char of line) {
    if (char === '\t') {
      out += ' '.repeat(4 - (out.length % 4))
    } else {
      out += char
    }
  }
  return out
}

/**
 * Pull `[label]: dest "title"` definitions out before block parsing.
 *
 * They can appear anywhere and are not themselves rendered, so lifting them
 * first keeps the block parser from having to consider them at every level.
 *
 * A definition may wrap across lines — the destination on the line below the
 * label, the title below that, and the title itself spanning several — so this
 * works on a joined region rather than line by line. It cannot span a *blank*
 * line, which is what bounds the region.
 */
function extractReferenceDefinitions(lines, refs) {
  const kept = []
  let i = 0
  let fenceMarker = null

  while (i < lines.length) {
    const line = lines[i]

    // A definition-shaped line inside a code fence is code.
    const fence = FENCE.exec(line)
    if (fence) {
      if (fenceMarker && line.trim().startsWith(fenceMarker)) fenceMarker = null
      else if (!fenceMarker) fenceMarker = fence[2][0].repeat(3)
      kept.push(line)
      i++
      continue
    }

    if (fenceMarker || /^ {4}/.test(line)) {
      kept.push(line)
      i++
      continue
    }

    const definition = readDefinition(lines, i)
    if (!definition) {
      kept.push(line)
      i++
      continue
    }

    // First definition of a label wins; later ones are ignored, not overridden.
    if (!(definition.label in refs)) {
      refs[definition.label] = { dest: definition.dest, title: definition.title }
    }

    i = definition.next
  }

  return kept
}

/**
 * Read one link reference definition starting at `start`, or null.
 *
 * @returns {{label: string, dest: string, title: string|null, next: number}|null}
 */
function readDefinition(lines, start) {
  // Most lines cannot begin a definition, and rejecting them before joining
  // the region below is what keeps this linear: the join used to happen for
  // every line, re-reading the rest of its paragraph each time.
  if (!/^ {0,3}\[/.test(lines[start])) return null

  let end = start
  const limit = Math.min(lines.length, start + MAX_DEFINITION_LINES)
  while (end < limit && lines[end].trim() !== '') end++
  if (end === start) return null

  const text = lines.slice(start, end).join('\n')

  const label = /^ {0,3}\[((?:[^\][\\]|\\.)+)\]:/.exec(text)
  if (!label || label[1].trim() === '' || label[1].length > MAX_LABEL_LENGTH) return null

  let pos = label[0].length

  // Whitespace before the destination may include one line ending, no more.
  const gap = /^[ \t]*\n?[ \t]*/.exec(text.slice(pos))[0]
  pos += gap.length

  let dest
  if (text[pos] === '<') {
    const close = text.indexOf('>', pos)
    if (close === -1 || text.slice(pos, close).includes('\n')) return null
    dest = text.slice(pos + 1, close)
    pos = close + 1
  } else {
    const run = /^[^\s]+/.exec(text.slice(pos))
    if (!run) return null
    dest = run[0]
    pos += run[0].length
  }

  const afterDest = pos

  // A title must be separated from the destination by whitespace, and nothing
  // but whitespace may follow it on its line — otherwise the whole construct is
  // not a definition at all and stays an ordinary paragraph.
  let title = null
  const titleGap = /^[ \t]*\n?[ \t]*/.exec(text.slice(pos))[0]
  const titleStart = pos + titleGap.length

  if (titleGap.length > 0 && titleStart < text.length) {
    const quoted = /^(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|\(((?:[^()\\]|\\.)*)\))/.exec(text.slice(titleStart))

    if (quoted && /^[ \t]*(\n|$)/.test(text.slice(titleStart + quoted[0].length))) {
      title = quoted[1] ?? quoted[2] ?? quoted[3]
      pos = titleStart + quoted[0].length
    }
  }

  if (title === null) {
    if (!/^[ \t]*(\n|$)/.test(text.slice(afterDest))) return null
    pos = afterDest
  }

  pos += /^[ \t]*/.exec(text.slice(pos))[0].length

  return {
    label: normalizeLabel(label[1]),
    dest: unescape(dest),
    title: title === null ? null : unescape(title),
    next: start + text.slice(0, pos).split('\n').length
  }
}

function normalizeLabel(label) {
  return label.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Resolve backslash escapes and entities outside inline parsing.
 *
 * URLs, titles and code-fence info strings never reach the inline parser, so
 * they need their own pass — otherwise `[x](/f&ouml;&ouml;)` links to a path
 * spelled with a literal ampersand.
 */
function unescape(text) {
  return decodeEntities(String(text).replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, '$1'))
}

/**
 * Parse a run of lines into block nodes.
 *
 * Recursive rather than the incremental container-stack approach the reference
 * implementation uses: a blockquote or list item hands its inner lines back to
 * this function, which keeps nesting straightforward at the cost of a little
 * re-scanning.
 */
function parseBlocks(lines, depth = 0) {
  const blocks = []
  let i = 0

  while (i < lines.length) {
    if (lines[i].trim() === '') { i++; continue }

    const from = i
    const result = parseOneBlock(lines, i, depth)

    // Every block records the lines it consumed. List looseness turns on
    // whether a blank line falls between two blocks, and that question cannot
    // be answered from indentation alone.
    for (const block of result.blocks) {
      block.from = from
      block.to = result.next
      blocks.push(block)
    }

    // A block that consumes nothing would spin here forever.
    i = result.next > i ? result.next : i + 1
  }

  return blocks
}

/**
 * Identify and read whichever block starts at `start`.
 *
 * `depth` is how many containers (blockquotes, list items) enclose these
 * lines. Past MAX_BLOCK_DEPTH a container marker is read as paragraph text:
 * each level is a recursive call, and following the input's nesting without a
 * bound is a stack overflow on demand.
 */
function parseOneBlock(lines, start, depth = 0) {
  const line = lines[start]
  const nestable = depth < MAX_BLOCK_DEPTH

  if (THEMATIC.test(line)) {
    return { blocks: [{ type: 'hr' }], next: start + 1 }
  }

  const atx = ATX.exec(line)
  if (atx) {
    return {
      blocks: [{ type: 'heading', level: atx[1].length, content: (atx[2] || '').trim() }],
      next: start + 1
    }
  }

  const fence = FENCE.exec(line)
  if (fence) {
    const result = readFencedCode(lines, start, fence)
    return { blocks: [result.block], next: result.next }
  }

  if (nestable && BLOCKQUOTE.test(line)) {
    const result = readBlockquote(lines, start, depth)
    return { blocks: [result.block], next: result.next }
  }

  if (nestable && (BULLET.test(line) || ORDERED.test(line))) {
    const result = readList(lines, start, depth)
    return { blocks: [result.block], next: result.next }
  }

  // Four spaces of indent is code, but only where a paragraph is not already
  // running — inside one it is a continuation line.
  if (/^ {4}/.test(line)) {
    const result = readIndentedCode(lines, start)
    return { blocks: [result.block], next: result.next }
  }

  if (start + 1 < lines.length && isTableStart(lines, start)) {
    const result = readTable(lines, start)
    return { blocks: [result.block], next: result.next }
  }

  const result = readParagraph(lines, start)
  return { blocks: result.blocks, next: result.next }
}

function readFencedCode(lines, start, fence) {
  const indent = fence[1].length
  const marker = fence[2][0]
  const length = fence[2].length
  const info = unescape(fence[3].trim())

  const content = []
  let i = start + 1

  while (i < lines.length) {
    const closing = new RegExp(`^ {0,3}${marker === '`' ? '`' : '~'}{${length},}[ \\t]*$`)
    if (closing.test(lines[i])) {
      i++
      break
    }

    // The opening fence's indentation is removed from each line, up to its
    // width — deeper indentation is content.
    content.push(lines[i].slice(0, indent).trim() === '' ? lines[i].slice(indent) : lines[i])
    i++
  }

  return {
    block: { type: 'code', info, literal: content.join('\n') + (content.length ? '\n' : '') },
    next: i
  }
}

function readIndentedCode(lines, start) {
  const content = []
  let i = start
  let lastNonBlank = start

  while (i < lines.length) {
    if (lines[i].trim() === '') {
      content.push('')
      i++
      continue
    }

    if (!/^ {4}/.test(lines[i])) break

    content.push(lines[i].slice(4))
    i++
    lastNonBlank = i
  }

  // Trailing blank lines belong to whatever follows, not to the code block.
  const trimmed = content.slice(0, lastNonBlank - start)

  return {
    block: { type: 'code', info: '', literal: trimmed.join('\n') + (trimmed.length ? '\n' : '') },
    next: lastNonBlank
  }
}

function readBlockquote(lines, start, depth = 0) {
  const inner = []
  let i = start

  while (i < lines.length) {
    const line = lines[i]

    if (BLOCKQUOTE.test(line)) {
      inner.push(line.replace(BLOCKQUOTE, ''))
      i++
      continue
    }

    // Lazy continuation: a plain line under a quoted paragraph stays in the
    // quote. A blank line, or anything that starts a new block, ends it.
    if (line.trim() === '') break
    if (THEMATIC.test(line) || ATX.test(line) || FENCE.test(line)) break
    if (BULLET.test(line) || ORDERED.test(line)) break
    if (inner.length === 0 || inner[inner.length - 1].trim() === '') break

    inner.push(line)
    i++
  }

  return { block: { type: 'blockquote', children: parseBlocks(inner, depth + 1) }, next: i }
}
/**
 * Read a list and its items.
 *
 * Two things here are fiddly and both are load-bearing.
 *
 * **Content indent.** How far an item's content is indented decides which
 * following lines belong to it. Normally that is the marker plus the spaces
 * after it — but five or more spaces means the marker is followed by *one*
 * space and an indented code block, so `1.     x` is a list item containing
 * code rather than an item indented seven columns.
 *
 * **Tight versus loose.** A list with a blank line between two of its blocks
 * wraps each item's text in `<p>`; one without does not. Getting it wrong puts
 * a paragraph's margin around every bullet, and the failure is not local — a
 * blank line inside a deeply nested item must not make its ancestors loose.
 */
function readList(lines, start, depth = 0) {
  const ordered = !BULLET.test(lines[start])
  const first = ordered ? ORDERED.exec(lines[start]) : BULLET.exec(lines[start])
  const startNumber = ordered ? parseInt(first[2], 10) : null
  const markerChar = ordered ? first[3] : first[2]

  const items = []
  let loose = false
  let i = start
  let sawBlank = false

  while (i < lines.length) {
    const line = lines[i]

    if (line.trim() === '') {
      sawBlank = true
      i++
      continue
    }

    const bullet = BULLET.exec(line)
    const numbered = ORDERED.exec(line)

    // A different marker character starts a new list rather than continuing
    // this one, which is how two adjacent lists stay separate.
    const sameKind = ordered
      ? Boolean(numbered) && numbered[3] === markerChar
      : Boolean(bullet) && bullet[2] === markerChar

    // The item-collection loop below consumes every continuation line, so
    // anything reaching here that is not a new item ends the list.
    if (!sameKind) break

    if (items.length > 0 && sawBlank) loose = true
    sawBlank = false

    const contentIndent = measureContentIndent(line, bullet, numbered)

    const itemLines = [line.slice(Math.min(contentIndent, line.length))]
    i++

    // Collect continuation lines: anything indented to the item's content
    // column, plus blank lines, plus lazy paragraph continuations.
    let pendingBlanks = 0
    while (i < lines.length) {
      const next = lines[i]

      if (next.trim() === '') {
        pendingBlanks++
        i++
        continue
      }

      const nextIndent = next.length - next.trimStart().length

      if (nextIndent >= contentIndent) {
        // Blank lines are kept but do not themselves decide looseness: the
        // blank may belong to a nested list, and each level answers that
        // question for itself once its own blocks are known.
        for (let b = 0; b < pendingBlanks; b++) itemLines.push('')
        pendingBlanks = 0
        itemLines.push(next.slice(contentIndent))
        i++
        continue
      }

      // A blank line followed by an unindented line ends the item.
      if (pendingBlanks) break

      // Lazy continuation of the item's paragraph.
      if (BULLET.test(next) || ORDERED.test(next) || THEMATIC.test(next) ||
          ATX.test(next) || FENCE.test(next) || BLOCKQUOTE.test(next)) break

      itemLines.push(next)
      i++
    }

    if (pendingBlanks) sawBlank = true

    items.push({ lines: itemLines })
  }

  const parsed = items.map((item) => parseBlocks(item.lines, depth + 1))

  // A blank line inside an item makes the list loose — but only when it
  // separates two of *that item's own* blocks. A blank inside a nested list
  // belongs to that list's looseness, not to this one's.
  if (!loose) {
    loose = items.some((item, n) => separatesBlocks(item.lines, parsed[n]))
  }

  return {
    block: { type: 'list', ordered, start: startNumber, tight: !loose, items: parsed },
    next: i
  }
}

/**
 * Column at which a list item's content begins.
 *
 * Five or more spaces after the marker is not deep indentation — it is one
 * space plus an indented code block, and reading it the other way swallows the
 * code into the item's paragraph.
 */
function measureContentIndent(line, bullet, numbered) {
  const indent = (numbered || bullet)[1].length
  const markerEnd = numbered ? indent + numbered[2].length + 1 : indent + 1
  const spaces = (numbered ? numbered[4] : bullet[3]) || ''

  // An empty item — a marker alone on its line — puts content one column on.
  if (spaces.length === 0 || spaces.length > 4) return markerEnd + 1

  return markerEnd + spaces.length
}

/**
 * Whether a blank line falls between two of this item's own blocks.
 *
 * Asked of the parsed blocks rather than the raw indentation, because "is this
 * line a new block of mine or a continuation of something nested" is exactly
 * what the block parser already worked out.
 */
function separatesBlocks(lines, blocks) {
  for (let b = 1; b < blocks.length; b++) {
    // The line immediately above a block that is not the item's first. Looking
    // here rather than at the gap between ranges matters when the preceding
    // block is a nested list, which swallows the blank line into its own range
    // on the way out.
    const above = blocks[b].from - 1

    if (above >= 0 && lines[above] !== undefined && lines[above].trim() === '') return true
  }

  return false
}

function isTableStart(lines, i) {
  const header = lines[i]
  const delimiter = lines[i + 1]

  if (!header.includes('|')) return false
  if (!delimiter || !TABLE_DELIM.test(delimiter)) return false
  if (!delimiter.includes('-')) return false

  return splitTableRow(header).length === splitTableRow(delimiter).length
}

function readTable(lines, start) {
  const header = splitTableRow(lines[start])
  const align = splitTableRow(lines[start + 1]).map((cell) => {
    const left = cell.trim().startsWith(':')
    const right = cell.trim().endsWith(':')
    if (left && right) return 'center'
    if (right) return 'right'
    if (left) return 'left'
    return null
  })

  const rows = []
  let i = start + 2

  while (i < lines.length && lines[i].trim() !== '' && lines[i].includes('|')) {
    if (THEMATIC.test(lines[i])) break

    const cells = splitTableRow(lines[i])
    // Short rows are padded and long ones truncated, so the table stays
    // rectangular rather than producing ragged markup.
    while (cells.length < header.length) cells.push('')
    rows.push(cells.slice(0, header.length))
    i++
  }

  return { block: { type: 'table', header, align, rows }, next: i }
}

function splitTableRow(line) {
  let trimmed = line.trim()
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1)
  if (trimmed.endsWith('|') && !trimmed.endsWith('\\|')) trimmed = trimmed.slice(0, -1)

  const cells = []
  let current = ''

  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === '\\' && trimmed[i + 1] === '|') {
      current += '|'
      i++
      continue
    }
    if (trimmed[i] === '|') {
      cells.push(current.trim())
      current = ''
      continue
    }
    current += trimmed[i]
  }

  cells.push(current.trim())
  return cells
}

/**
 * Whether a list marker on this line ends the paragraph above it.
 *
 * Not every marker does. An ordered list may only interrupt a paragraph when it
 * starts at 1, which is what stops
 *
 *     The number of windows in my house is
 *     14.  The number of doors is 6.
 *
 * from turning a sentence that wrapped onto the next line into a list starting
 * at fourteen. An empty item cannot interrupt either, so a line of just `-`
 * under a paragraph stays text.
 */
function interruptsParagraph(line) {
  const bullet = BULLET.exec(line)
  if (bullet) return line.slice(bullet[0].length).trim() !== ''

  const ordered = ORDERED.exec(line)
  if (!ordered) return false

  if (ordered[2] !== '1') return false

  return line.slice(ordered[0].length).trim() !== ''
}

function readParagraph(lines, start) {
  const content = []
  let i = start

  while (i < lines.length) {
    const line = lines[i]

    if (line.trim() === '') break

    // A setext underline turns the paragraph so far into a heading. This is
    // checked before the thematic-break test on purpose: a line of dashes is
    // both, and while a paragraph is open the heading reading wins. Testing
    // thematic first turns every `Title\n-----` into a paragraph and an <hr>.
    if (content.length > 0 && SETEXT.test(line)) {
      return {
        blocks: [{ type: 'heading', level: line.trim()[0] === '=' ? 1 : 2, content: content.join('\n').trim() }],
        next: i + 1
      }
    }

    // Only a line *after* the first can interrupt. The first reached here
    // because no other block claimed it — normally that means it is plain
    // text, and past the nesting limit it means a container marker that is
    // being read as text on purpose. Breaking on it dropped the line.
    if (content.length > 0) {
      if (THEMATIC.test(line) || ATX.test(line) || FENCE.test(line) || BLOCKQUOTE.test(line)) break
      if (interruptsParagraph(line)) break
      if (isTableStart(lines, i)) break
    }

    // Leading indentation is dropped but trailing spaces are kept: two of them
    // before a newline is the hard-break syntax, and trimming here would have
    // deleted the thing the inline parser is about to look for.
    content.push(line.trimStart())
    i++
  }

  if (content.length === 0) return { blocks: [], next: start + 1 }

  return { blocks: [{ type: 'paragraph', content: content.join('\n') }], next: i }
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

function renderBlocks(blocks, context) {
  return blocks.map((block) => renderBlock(block, context)).join('')
}

function renderBlock(block, context) {
  switch (block.type) {
    case 'paragraph':
      return `<p>${renderInlines(block.content, context)}</p>\n`

    case 'heading': {
      const inner = renderInlines(block.content, context)
      if (!context.headingIds) return `<h${block.level}>${inner}</h${block.level}>\n`

      const slug = uniqueId(context, context.slugify(stripInlineMarkup(block.content)))
      if (!slug) return `<h${block.level}>${inner}</h${block.level}>\n`

      const id = escapeHtml(context.idPrefix + slug)
      context.emittedIds.add(id)
      return `<h${block.level} id="${id}">${inner}</h${block.level}>\n`
    }

    case 'code': {
      // The info string is a class name, so only its first word is used and it
      // is escaped — it comes from the document like everything else.
      const language = block.info.split(/\s+/)[0]
      const attr = language ? ` class="language-${escapeHtml(language)}"` : ''
      return `<pre><code${attr}>${escapeHtml(block.literal)}</code></pre>\n`
    }

    case 'blockquote':
      return `<blockquote>\n${renderBlocks(block.children, context)}</blockquote>\n`

    case 'hr':
      return '<hr />\n'

    case 'list': {
      const tag = block.ordered ? 'ol' : 'ul'
      const startAttr = block.ordered && block.start !== 1 ? ` start="${block.start}"` : ''

      const items = block.items.map((item) => {
        if (block.tight) {
          // In a tight list a paragraph contributes its text without the
          // wrapping <p>; anything else renders normally. A paragraph with a
          // block after it still needs its line ending, or the text runs into
          // the opening tag of whatever follows.
          const inner = item.map((child, n) => {
            if (child.type !== 'paragraph') return renderBlock(child, context)

            const text = renderInlines(child.content, context)
            return n < item.length - 1 ? `${text}\n` : text
          }).join('')

          return `<li>${inner}</li>\n`
        }
        return `<li>\n${renderBlocks(item, context)}</li>\n`
      }).join('')

      return `<${tag}${startAttr}>\n${items}</${tag}>\n`
    }

    case 'table': {
      const head = block.header.map((cell, i) =>
        `<th${alignAttr(block.align[i])}>${renderInlines(cell, context)}</th>`
      ).join('')

      const body = block.rows.map((row) =>
        `<tr>${row.map((cell, i) => `<td${alignAttr(block.align[i])}>${renderInlines(cell, context)}</td>`).join('')}</tr>\n`
      ).join('')

      return `<table>\n<thead>\n<tr>${head}</tr>\n</thead>\n<tbody>\n${body}</tbody>\n</table>\n`
    }

    default:
      return ''
  }
}

function alignAttr(align) {
  return align ? ` align="${align}"` : ''
}

function uniqueId(context, base) {
  if (!base) return ''

  // Each base remembers the next suffix to try. Starting from -2 every time
  // made a document of N identical headings cost N² lookups — over a minute
  // for 50,000 `# a` lines.
  let n = context.idCounters.get(base) || 2
  let id = base
  while (context.usedIds.has(id)) id = `${base}-${n++}`
  context.idCounters.set(base, n)

  context.usedIds.add(id)
  return id
}

/* ------------------------------------------------------------------ *
 * Inlines
 * ------------------------------------------------------------------ */

/**
 * Two different notions of punctuation, which is not a distinction worth
 * inventing but is one the spec makes.
 *
 * A backslash escapes only ASCII punctuation — `\q` stays a literal backslash
 * followed by q. Emphasis flanking, meanwhile, asks whether the neighbouring
 * character is Unicode punctuation *or symbol*, which is a wider set and
 * includes the very characters (`$ + < = > ^ | ~`) that made escaping look
 * broken when one set was used for both jobs.
 */
const ESCAPABLE = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/
const PUNCTUATION = /[\p{P}\p{S}]/u

/**
 * Parse and render the inline content of one block.
 *
 * @param {string} text
 * @param {Object} context
 * @returns {string} HTML
 */
export function renderInlines(text, context) {
  const nodes = parseInlines(text, context)
  return renderNodes(nodes, context)
}

/**
 * Build a linked list of inline nodes.
 *
 * Emphasis cannot be resolved in a single left-to-right pass — whether a `*`
 * opens or closes depends on what follows it, and which opener a closer pairs
 * with depends on lengths and nesting. So delimiters are recorded as they are
 * seen and matched up afterwards.
 */
function parseInlines(text, context) {
  const head = { type: 'root', next: null, prev: null }
  let tail = head
  /** @type {Array} Delimiter runs, in source order. */
  const delimiters = []
  /**
   * Unmatched `[` and `![`. Openers below `brackets.floor` are inactive: a
   * link closed above them, and links do not nest. Tracking that as a floor
   * rather than a flag on each opener is what keeps closing a link O(1) —
   * flagging them all walked the whole stack once per link.
   */
  const brackets = []
  brackets.floor = 0

  /** Memo for scans that cannot succeed again; see readInlineDestination. */
  const scan = { noCloser: Object.create(null), backtickRuns: null }

  const append = (node) => {
    node.prev = tail
    node.next = null
    tail.next = node
    tail = node
    return node
  }

  let i = 0

  while (i < text.length) {
    const char = text[i]

    if (char === '\\') {
      const next = text[i + 1]
      if (next === '\n') {
        append({ type: 'linebreak' })
        i += 2
        continue
      }
      if (next && ESCAPABLE.test(next)) {
        append({ type: 'text', literal: next })
        i += 2
        continue
      }
      append({ type: 'text', literal: '\\' })
      i++
      continue
    }

    if (char === '`') {
      const result = readCodeSpan(text, i, scan)
      if (result.literal !== undefined) {
        append({ type: 'code', literal: result.literal })
        i = result.next
        continue
      }
      // An unmatched run is literal as a whole. Re-trying from its second
      // backtick both misreads ``` ``foo` ``` and rescans the paragraph once
      // per backtick.
      append({ type: 'text', literal: text.slice(i, result.next) })
      i = result.next
      continue
    }

    if (char === '<') {
      const result = readAutolink(text, i, context)
      if (result) {
        append(result.node)
        i = result.next
        continue
      }
      // Anything else angle-bracketed is text. This is the deliberate
      // divergence from CommonMark: raw HTML is shown, never executed.
      append({ type: 'text', literal: '<' })
      i++
      continue
    }

    if (char === '\n') {
      // Two trailing spaces before a newline is a hard break.
      const hard = /[ ]{2,}$/.test(sliceTextBefore(tail))
      if (hard) trimTrailingSpaces(tail)
      append({ type: hard ? 'linebreak' : 'softbreak' })
      i++
      continue
    }

    if (char === '!' && text[i + 1] === '[') {
      const node = append({ type: 'text', literal: '![' })
      brackets.push({ node, image: true, index: delimiters.length, position: i })
      i += 2
      continue
    }

    if (char === '[') {
      const node = append({ type: 'text', literal: '[' })
      brackets.push({ node, image: false, index: delimiters.length, position: i })
      i++
      continue
    }

    if (char === ']') {
      const result = closeBracket(text, i, brackets, delimiters, context, scan)
      if (result) {
        tail = result.tail
        i = result.next
        continue
      }
      append({ type: 'text', literal: ']' })
      i++
      continue
    }

    if (char === '*' || char === '_' || char === '~') {
      const run = readDelimiterRun(text, i, char)
      const node = append({ type: 'text', literal: char.repeat(run.length) })

      delimiters.push({
        node,
        char,
        numDelims: run.length,
        origDelims: run.length,
        canOpen: run.canOpen,
        canClose: run.canClose,
        active: true
      })

      i += run.length
      continue
    }

    if (char === '&') {
      ENTITY.lastIndex = i
      const entity = ENTITY.exec(text)
      if (entity) {
        append({ type: 'text', literal: decodeEntities(entity[0]) })
        i += entity[0].length
        continue
      }
      append({ type: 'text', literal: '&' })
      i++
      continue
    }

    // Plain text up to the next character that could mean something.
    const nextSpecial = findNextSpecial(text, i + 1)
    append({ type: 'text', literal: text.slice(i, nextSpecial) })
    i = nextSpecial
  }

  processEmphasis(delimiters, null)

  return head
}

/** Sticky, so it matches at an offset instead of on a copy of the rest. */
const ENTITY = /&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]{1,31});/y
const AUTOLINK_URI = /<([a-zA-Z][a-zA-Z0-9+.-]{1,31}:[^<>\x00-\x20]*)>/y
const AUTOLINK_EMAIL = /<([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)>/y
const LINK_LABEL = /\[((?:[^\][\\]|\\.)*)\]/y

function findNextSpecial(text, from) {
  for (let i = from; i < text.length; i++) {
    const c = text[i]
    if (c === '\\' || c === '`' || c === '<' || c === '\n' || c === '[' ||
        c === ']' || c === '*' || c === '_' || c === '~' || c === '&' || c === '!') {
      return i
    }
  }
  return text.length
}

function sliceTextBefore(node) {
  return node && node.type === 'text' ? node.literal : ''
}

function trimTrailingSpaces(node) {
  if (node && node.type === 'text') node.literal = node.literal.replace(/ +$/, '')
}

/**
 * Read a code span.
 *
 * The closing run must be exactly as long as the opening one, which is what
 * lets `` `a ` b` `` hold a backtick.
 *
 * Finding that closer by searching the rest of the text from every opener is
 * quadratic — runs of one, two, three… backticks each search to the end. So
 * every run in the text is indexed once by length, and each opener looks up
 * the first run of its length after it.
 *
 * @returns {{ literal?: string, next: number }} `literal` is absent when the
 *   run has no closer; `next` is then the end of the opening run.
 */
function readCodeSpan(text, start, scan) {
  let end = start
  while (text[end] === '`') end++
  const length = end - start

  if (!scan.backtickRuns) scan.backtickRuns = indexBacktickRuns(text)

  const runs = scan.backtickRuns.get(length)
  let closeAt = -1

  if (runs) {
    // Openers are visited left to right, so a cursor per length only moves
    // forward and the lookups cost O(runs) in total.
    while (runs.cursor < runs.starts.length && runs.starts[runs.cursor] < end) runs.cursor++
    if (runs.cursor < runs.starts.length) closeAt = runs.starts[runs.cursor]
  }

  if (closeAt === -1) return { next: end }

  let literal = text.slice(end, closeAt).replace(/\n/g, ' ')

  // One space is stripped from each end when both are present, so `` ` `` can
  // be written as `` ` ``.
  if (literal.length > 2 && literal.startsWith(' ') && literal.endsWith(' ') && literal.trim() !== '') {
    literal = literal.slice(1, -1)
  }

  return { literal, next: closeAt + length }
}

/** Every maximal backtick run, grouped by length, in source order. */
function indexBacktickRuns(text) {
  const runs = new Map()
  let i = text.indexOf('`')

  while (i !== -1 && i < text.length) {
    let end = i
    while (text[end] === '`') end++

    const length = end - i
    if (!runs.has(length)) runs.set(length, { starts: [], cursor: 0 })
    runs.get(length).starts.push(i)

    i = text.indexOf('`', end)
  }

  return runs
}

/** Read `<https://…>` or `<user@host>`. */
function readAutolink(text, start, context) {
  AUTOLINK_URI.lastIndex = start
  const uri = AUTOLINK_URI.exec(text)
  if (uri) {
    const dest = decodeEntities(uri[1])
    if (!isSafeUrl(dest, context.schemes)) {
      return { node: { type: 'text', literal: uri[0] }, next: start + uri[0].length }
    }
    return {
      node: { type: 'link', dest, title: null, children: textNode(uri[1]) },
      next: start + uri[0].length
    }
  }

  AUTOLINK_EMAIL.lastIndex = start
  const email = AUTOLINK_EMAIL.exec(text)
  if (email) {
    return {
      node: { type: 'link', dest: `mailto:${email[1]}`, title: null, children: textNode(email[1]) },
      next: start + email[0].length
    }
  }

  return null
}

function textNode(literal) {
  const head = { type: 'root', next: null, prev: null }
  const node = { type: 'text', literal, prev: head, next: null }
  head.next = node
  return head
}

/**
 * Try to close a link or image at `]`.
 *
 * Returns null when there is no matching opener or no destination follows, in
 * which case the `]` is literal text.
 *
 * Only the top of the bracket stack is considered, as in the CommonMark
 * reference algorithm: an inactive or failed opener is removed rather than
 * skipped, so each `]` costs O(1) instead of a walk down the stack.
 */
function closeBracket(text, index, brackets, delimiters, context, scan) {
  const opener = brackets[brackets.length - 1]
  if (!opener) return null

  const removeOpener = () => {
    brackets.pop()
    if (brackets.floor > brackets.length) brackets.floor = brackets.length
  }

  // Below the floor: a link has closed since this opener, and links do not nest.
  if (brackets.length - 1 < brackets.floor) {
    removeOpener()
    return null
  }

  let dest = null
  let title = null
  let next = index + 1

  const inline = text[index + 1] === '(' ? readInlineDestination(text, index + 1, scan) : null
  if (inline) {
    dest = inline.dest
    title = inline.title
    next = inline.end
  } else {
    // Reference link: [text][label], [text][] or [text].
    LINK_LABEL.lastIndex = index + 1
    const labelMatch = LINK_LABEL.exec(text)
    const innerStart = opener.position + (opener.image ? 2 : 1)
    const rawLabel = labelMatch && labelMatch[1] ? labelMatch[1] : null

    // A label over the spec's limit cannot name a definition, and slicing the
    // text between every `]` and its opener is quadratic for `[[[…]]]`.
    const label = rawLabel !== null
      ? (rawLabel.length <= MAX_LABEL_LENGTH ? normalizeLabel(rawLabel) : null)
      : (index - innerStart <= MAX_LABEL_LENGTH ? normalizeLabel(text.slice(innerStart, index)) : null)
    const ref = label === null ? undefined : context.refs[label]

    if (ref) {
      dest = ref.dest
      title = ref.title
      next = labelMatch ? index + 1 + labelMatch[0].length : index + 1
    }
  }

  if (dest === null) {
    removeOpener()
    return null
  }

  const decoded = decodeEntities(dest)
  if (!isSafeUrl(decoded, context.schemes)) {
    // The link text still renders; only the destination is dropped.
    removeOpener()
    return null
  }

  // Everything after the opening bracket becomes the link's children.
  const children = { type: 'root', next: opener.node.next, prev: null }
  if (children.next) children.next.prev = children

  // Delimiters inside the link resolve before the link is wrapped, so
  // `[*a*](x)` emphasises within the anchor.
  processEmphasis(delimiters, opener.index)

  const node = {
    type: opener.image ? 'image' : 'link',
    dest: decoded,
    title,
    children
  }

  // Replace the opener's text node and everything after it with the new node.
  const before = opener.node.prev
  before.next = node
  node.prev = before
  node.next = null

  brackets.pop()

  // A link cannot nest inside a link, so any opener still on the stack is spent.
  if (!opener.image) brackets.floor = brackets.length
  else if (brackets.floor > brackets.length) brackets.floor = brackets.length

  delimiters.length = opener.index

  return { tail: node, next }
}

const LINK_WHITESPACE = /[ \t\n]/

/**
 * Read `(dest "title")` starting at the `(` at `start`.
 *
 * Works at offsets into the paragraph rather than on `text.slice(...)`; the
 * copy alone made every `](` cost the length of the rest of the text. Two
 * scans could still run to the end of the text from every opener, and both
 * are bounded:
 *
 * - an unbracketed destination stops after MAX_LINK_PAREN_DEPTH nested `(`;
 * - a title looking for its closing quote or paren records, on failure, that
 *   no such closer exists from that point on, so later titles fail at once.
 *   That memo is sound because a later scan covers a subset of the text the
 *   failed one already searched, starting at the same escape alignment.
 *
 * @returns {{ dest: string, title: string|null, end: number }|null} `end` is
 *   the index after the closing `)`.
 */
function readInlineDestination(text, start, scan) {
  let i = start + 1
  while (i < text.length && LINK_WHITESPACE.test(text[i])) i++

  let dest = ''

  if (text[i] === '<') {
    // A bracketed destination may not contain a line ending or an unescaped
    // `<` (CommonMark 6.3), which also stops it scanning to the end of the text.
    let j = i + 1
    while (j < text.length) {
      const c = text[j]
      if (c === '\\' && j + 1 < text.length) { j += 2; continue }
      if (c === '>' || c === '<' || c === '\n') break
      j++
    }
    if (text[j] !== '>') return null
    dest = unescape(text.slice(i + 1, j))
    i = j + 1
  } else {
    let depth = 0
    const startDest = i
    while (i < text.length) {
      const c = text[i]
      if (c === '\\' && text[i + 1]) { i += 2; continue }
      if (c === '(') {
        depth++
        if (depth > MAX_LINK_PAREN_DEPTH) return null
      } else if (c === ')') { if (depth === 0) break; depth-- }
      else if (LINK_WHITESPACE.test(c)) break
      i++
    }
    if (depth !== 0) return null
    // Only punctuation is escapable, so the backslash in a Windows-style path
    // stays put rather than silently vanishing.
    dest = unescape(text.slice(startDest, i))
  }

  while (i < text.length && LINK_WHITESPACE.test(text[i])) i++

  let title = null
  const quote = text[i]
  if (quote === '"' || quote === "'" || quote === '(') {
    const closer = quote === '(' ? ')' : quote
    const from = i + 1
    let j = from

    if (from >= (scan.noCloser[closer] ?? Infinity)) return null

    while (j < text.length && text[j] !== closer) {
      j += text[j] === '\\' && j + 1 < text.length ? 2 : 1
    }

    if (j >= text.length) {
      scan.noCloser[closer] = Math.min(scan.noCloser[closer] ?? Infinity, from)
      return null
    }

    title = unescape(text.slice(from, j))
    i = j + 1
  }

  while (i < text.length && LINK_WHITESPACE.test(text[i])) i++

  if (text[i] !== ')') return null

  return { dest, title, end: i + 1 }
}

/**
 * Measure a run of `*`, `_` or `~` and decide whether it can open or close.
 *
 * The flanking rules are what make `a * b` literal and `*a*` emphasis. `_` is
 * stricter than `*` so that `snake_case_words` survives intact — that single
 * difference is most of why the rules look fussy.
 */
function readDelimiterRun(text, start, char) {
  let length = 0
  while (text[start + length] === char) length++

  const before = start === 0 ? '\n' : text[start - 1]
  const after = start + length >= text.length ? '\n' : text[start + length]

  const beforeWhitespace = /\s/.test(before)
  const afterWhitespace = /\s/.test(after)
  const beforePunctuation = PUNCTUATION.test(before)
  const afterPunctuation = PUNCTUATION.test(after)

  const leftFlanking = !afterWhitespace && (!afterPunctuation || beforeWhitespace || beforePunctuation)
  const rightFlanking = !beforeWhitespace && (!beforePunctuation || afterWhitespace || afterPunctuation)

  if (char === '_') {
    return {
      length,
      canOpen: leftFlanking && (!rightFlanking || beforePunctuation),
      canClose: rightFlanking && (!leftFlanking || afterPunctuation)
    }
  }

  return { length, canOpen: leftFlanking, canClose: rightFlanking }
}

/**
 * Pair up emphasis delimiters.
 *
 * CommonMark's algorithm, including the "rule of three": when a delimiter can
 * both open and close, a pairing whose combined length is a multiple of three
 * is rejected. That rule exists so `*foo**bar**baz*` nests the way a reader
 * expects rather than the way a naive scan would pair it.
 */
function processEmphasis(delimiters, stackBottom) {
  const bottom = stackBottom === null ? 0 : stackBottom
  const openersBottom = { '*': [bottom, bottom, bottom], _: [bottom, bottom, bottom], '~': [bottom, bottom, bottom] }

  // The reference implementation unlinks spent delimiters from a linked list
  // so no search walks over them twice. With an array the same effect comes
  // from jump pointers over inactive entries, compressed as they are followed
  // (a delimiter never becomes active again, so a pointer never goes stale).
  // Without this, `'_a*'.repeat(n) + '*b_'.repeat(n)` walked back over every
  // spent delimiter for every closer: nine seconds at 200 kB.
  const jump = []
  const prevLive = (from) => {
    let j = from
    const path = []
    while (j >= bottom && !(delimiters[j] && delimiters[j].active)) {
      path.push(j)
      j = jump[j] !== undefined ? jump[j] : j - 1
    }
    for (const k of path) jump[k] = j
    return j
  }

  let closerIdx = bottom

  while (closerIdx < delimiters.length) {
    const closer = delimiters[closerIdx]

    if (!closer || !closer.active || !closer.canClose || closer.numDelims === 0) {
      closerIdx++
      continue
    }

    const lowerBound = openersBottom[closer.char][closer.origDelims % 3]
    let openerIdx = -1

    for (let i = prevLive(closerIdx - 1); i >= lowerBound && i >= bottom; i = prevLive(i - 1)) {
      const candidate = delimiters[i]
      if (!candidate || !candidate.active || candidate.char !== closer.char) continue
      if (!candidate.canOpen || candidate.numDelims === 0) continue

      const oddMatch =
        (closer.canOpen || candidate.canClose) &&
        closer.origDelims % 3 !== 0 &&
        (candidate.origDelims + closer.origDelims) % 3 === 0

      if (oddMatch) continue

      openerIdx = i
      break
    }

    if (openerIdx === -1) {
      openersBottom[closer.char][closer.origDelims % 3] = Math.max(bottom, closerIdx - 1)
      if (!closer.canOpen) closer.active = false
      closerIdx++
      continue
    }

    const opener = delimiters[openerIdx]

    // Strikethrough only exists as a pair; a single `~` stays literal.
    if (closer.char === '~' && (opener.numDelims < 2 || closer.numDelims < 2)) {
      closerIdx++
      continue
    }

    const useDelims = closer.char === '~' ? 2 : (opener.numDelims >= 2 && closer.numDelims >= 2 ? 2 : 1)
    const tag = closer.char === '~' ? 'del' : (useDelims === 2 ? 'strong' : 'em')

    opener.numDelims -= useDelims
    closer.numDelims -= useDelims
    opener.node.literal = opener.node.literal.slice(0, opener.numDelims)
    closer.node.literal = closer.node.literal.slice(0, closer.numDelims)

    // Wrap everything between the two delimiter nodes.
    const children = { type: 'root', next: null, prev: null }
    let cursor = opener.node.next

    if (cursor === closer.node) {
      children.next = null
    } else {
      children.next = cursor
      cursor.prev = children
      let last = cursor
      while (last.next && last.next !== closer.node) last = last.next
      last.next = null
    }

    const wrapper = { type: tag, children, prev: opener.node, next: closer.node }
    opener.node.next = wrapper
    closer.node.prev = wrapper

    // Delimiters strictly between the pair can never match anything now.
    for (let i = prevLive(closerIdx - 1); i > openerIdx; i = prevLive(i - 1)) {
      delimiters[i].active = false
    }

    if (opener.numDelims === 0) opener.active = false
    if (closer.numDelims === 0) { closer.active = false; closerIdx++ }
  }
}

/* ------------------------------------------------------------------ *
 * Node rendering
 * ------------------------------------------------------------------ */

function renderNodes(head, context, depth = 0) {
  let out = ''
  let node = head.next

  while (node) {
    out += renderNode(node, context, depth)
    node = node.next
  }

  return out
}

/**
 * Render one inline node.
 *
 * `****…a…****` nests one `<strong>` per pair of asterisks, and rendering
 * recurses once per level; past MAX_INLINE_DEPTH the rest is flattened to
 * text, which plainText does without recursion.
 */
function renderNode(node, context, depth = 0) {
  if (node.children && node.type !== 'image' && depth >= MAX_INLINE_DEPTH) {
    return escapeHtml(plainText(node.children))
  }

  switch (node.type) {
    case 'text':
      return escapeHtml(node.literal)

    case 'code':
      return `<code>${escapeHtml(node.literal)}</code>`

    case 'softbreak':
      return '\n'

    case 'linebreak':
      return '<br />\n'

    case 'em':
      return `<em>${renderNodes(node.children, context, depth + 1)}</em>`

    case 'strong':
      return `<strong>${renderNodes(node.children, context, depth + 1)}</strong>`

    case 'del':
      return `<del>${renderNodes(node.children, context, depth + 1)}</del>`

    case 'link': {
      const title = node.title ? ` title="${escapeHtml(node.title)}"` : ''
      return `<a href="${escapeHtml(encodeDestination(node.dest))}"${title}>${renderNodes(node.children, context, depth + 1)}</a>`
    }

    case 'image': {
      const title = node.title ? ` title="${escapeHtml(node.title)}"` : ''
      const alt = plainText(node.children)
      return `<img src="${escapeHtml(encodeDestination(node.dest))}" alt="${escapeHtml(alt)}"${title} />`
    }

    default:
      return ''
  }
}

/**
 * Percent-encode the parts of a URL that would otherwise break out of the
 * attribute, change the URL's meaning, or fail to survive transport.
 *
 * Existing `%XX` sequences are left alone so an already-encoded URL is not
 * double-encoded into a different one.
 */
function encodeDestination(dest) {
  return dest.replace(/%[0-9a-fA-F]{2}|[^\x21-\x7e]|[ "<>`{}\\^|[\]]/g, (chunk) => {
    if (/^%[0-9a-fA-F]{2}$/.test(chunk)) return chunk

    let out = ''
    for (const byte of new TextEncoder().encode(chunk)) {
      out += '%' + byte.toString(16).toUpperCase().padStart(2, '0')
    }
    return out
  })
}

/**
 * Flatten a node list to its text, for image alt attributes and for inline
 * nesting past the render limit. Iterative, with an explicit stack of where to
 * resume, so input nesting cannot reach the call stack.
 */
function plainText(head) {
  let out = ''
  const resume = []
  let node = head.next

  while (node || resume.length) {
    if (!node) { node = resume.pop(); continue }

    if (node.type === 'text' || node.type === 'code') out += node.literal
    else if (node.type === 'softbreak' || node.type === 'linebreak') out += ' '
    else if (node.children) {
      resume.push(node.next)
      node = node.children.next
      continue
    }
    node = node.next
  }

  return out
}

/** Remove inline markers, for heading slugs. */
function stripInlineMarkup(text) {
  return text
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/!?\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    .replace(/[*_~]+/g, '')
    .replace(/\\(.)/g, '$1')
    .trim()
}

/**
 * Turn a title into a URL slug.
 *
 * @param {string} text
 * @returns {string}
 */
export function defaultSlugify(text) {
  return String(text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}
