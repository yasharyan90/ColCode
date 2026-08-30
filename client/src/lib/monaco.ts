/**
 * Monaco bootstrap.
 *
 * Two things happen here, once, at module load:
 *  1. Wire Monaco's language workers to Vite-bundled workers (no CDN). We need the
 *     local `monaco-editor` package (not @monaco-editor/react's CDN loader) because
 *     y-monaco (milestone 2) binds directly against the same monaco instance.
 *  2. Register the cursor-dark theme so every editor can use it by name.
 */
import * as monaco from 'monaco-editor'
import { loader } from '@monaco-editor/react'
import editorWorker from 'monaco-editor/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/language/typescript/ts.worker?worker'
import { CURSOR_DARK, cursorDarkTheme } from '../theme/cursorDark'

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string): Worker {
    switch (label) {
      case 'json':
        return new jsonWorker()
      case 'css':
      case 'scss':
      case 'less':
        return new cssWorker()
      case 'html':
      case 'handlebars':
      case 'razor':
        return new htmlWorker()
      case 'typescript':
      case 'javascript':
        return new tsWorker()
      default:
        return new editorWorker()
    }
  },
}

monaco.editor.defineTheme(CURSOR_DARK, cursorDarkTheme)

// Sensible TS/JS defaults so IntelliSense works out of the box for browser-ish code.
monaco.typescript.typescriptDefaults.setCompilerOptions({
  target: monaco.typescript.ScriptTarget.ES2020,
  allowNonTsExtensions: true,
  moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
  module: monaco.typescript.ModuleKind.ESNext,
  jsx: monaco.typescript.JsxEmit.React,
  esModuleInterop: true,
  strict: false,
})
monaco.typescript.javascriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: false,
  noSyntaxValidation: false,
})

/**
 * IntelliSense-style completion for languages Monaco only tokenizes. TS/JS get
 * the real TypeScript service; for Python/Go/Ruby we add keywords + builtins on
 * top of Monaco's word-based suggestions (which already index the buffer).
 */
const KEYWORD_SETS: Record<string, { keywords: string[]; builtins: string[]; snippets?: [string, string, string][] }> = {
  python: {
    keywords: ['and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield', 'True', 'False', 'None'],
    builtins: ['print', 'len', 'range', 'enumerate', 'zip', 'map', 'filter', 'sorted', 'reversed', 'sum', 'min', 'max', 'abs', 'round', 'int', 'float', 'str', 'bool', 'list', 'dict', 'set', 'tuple', 'open', 'input', 'isinstance', 'hasattr', 'getattr', 'type', 'super', 'iter', 'next', 'any', 'all', 'format', 'repr', 'id', 'hash'],
    snippets: [['def', 'def ${1:name}(${2:args}):\n\t${0:pass}', 'function definition'], ['class', 'class ${1:Name}:\n\tdef __init__(self${2}):\n\t\t${0:pass}', 'class definition'], ['ifmain', 'if __name__ == "__main__":\n\t${0:main()}', 'main guard'], ['for', 'for ${1:item} in ${2:items}:\n\t${0:pass}', 'for loop'], ['try', 'try:\n\t${1:pass}\nexcept ${2:Exception} as ${3:e}:\n\t${0:pass}', 'try/except']],
  },
  go: {
    keywords: ['break', 'case', 'chan', 'const', 'continue', 'default', 'defer', 'else', 'fallthrough', 'for', 'func', 'go', 'goto', 'if', 'import', 'interface', 'map', 'package', 'range', 'return', 'select', 'struct', 'switch', 'type', 'var', 'nil', 'true', 'false', 'iota'],
    builtins: ['append', 'cap', 'close', 'copy', 'delete', 'len', 'make', 'new', 'panic', 'print', 'println', 'recover', 'string', 'int', 'int64', 'float64', 'bool', 'byte', 'rune', 'error', 'fmt.Println', 'fmt.Printf', 'fmt.Sprintf', 'fmt.Errorf', 'strings.Split', 'strings.Join', 'strconv.Itoa', 'strconv.Atoi', 'os.Args', 'os.Exit', 'time.Now', 'sort.Ints', 'sort.Strings'],
    snippets: [['main', 'package main\n\nimport "fmt"\n\nfunc main() {\n\t${0:fmt.Println("hello")}\n}', 'main package'], ['func', 'func ${1:name}(${2}) ${3:error} {\n\t${0}\n}', 'function'], ['iferr', 'if err != nil {\n\t${0:return err}\n}', 'error check'], ['for', 'for ${1:i} := 0; $1 < ${2:n}; $1++ {\n\t${0}\n}', 'for loop'], ['forr', 'for ${1:i}, ${2:v} := range ${3:items} {\n\t${0}\n}', 'range loop']],
  },
  ruby: {
    keywords: ['alias', 'and', 'begin', 'break', 'case', 'class', 'def', 'defined?', 'do', 'else', 'elsif', 'end', 'ensure', 'false', 'for', 'if', 'in', 'module', 'next', 'nil', 'not', 'or', 'redo', 'rescue', 'retry', 'return', 'self', 'super', 'then', 'true', 'undef', 'unless', 'until', 'when', 'while', 'yield', 'require', 'attr_accessor', 'attr_reader', 'private', 'lambda', 'proc'],
    builtins: ['puts', 'print', 'p', 'pp', 'gets', 'each', 'map', 'select', 'reject', 'reduce', 'inject', 'times', 'upto', 'downto', 'to_s', 'to_i', 'to_f', 'to_a', 'to_h', 'length', 'size', 'join', 'split', 'include?', 'empty?', 'nil?', 'raise', 'format', 'sort', 'sort_by', 'first', 'last', 'push', 'pop', 'keys', 'values'],
    snippets: [['def', 'def ${1:name}(${2})\n\t${0}\nend', 'method'], ['class', 'class ${1:Name}\n\tdef initialize(${2})\n\t\t${0}\n\tend\nend', 'class'], ['each', '${1:items}.each do |${2:item}|\n\t${0}\nend', 'each block']],
  },
}

for (const [language, set] of Object.entries(KEYWORD_SETS)) {
  monaco.languages.registerCompletionItemProvider(language, {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
      const K = monaco.languages.CompletionItemKind
      const suggestions: import('monaco-editor').languages.CompletionItem[] = [
        ...set.keywords.map((k) => ({ label: k, kind: K.Keyword, insertText: k, range })),
        ...set.builtins.map((b) => ({ label: b, kind: b.includes('.') ? K.Method : K.Function, insertText: b, range, detail: 'builtin' })),
        ...(set.snippets ?? []).map(([label, body, detail]) => ({ label, kind: K.Snippet, insertText: body, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, detail })),
      ]
      return { suggestions }
    },
  })
}

loader.config({ monaco })
if (import.meta.env.DEV) Object.assign(window as object, { __monaco: monaco })

export { monaco }

/** Map a filename to a Monaco language id. */
export function languageForFile(name: string): string {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    py: 'python', go: 'go', rs: 'rust', java: 'java', c: 'c', h: 'c',
    cpp: 'cpp', cc: 'cpp', hpp: 'cpp', cs: 'csharp', rb: 'ruby', php: 'php',
    json: 'json', md: 'markdown', html: 'html', css: 'css', scss: 'scss',
    yml: 'yaml', yaml: 'yaml', sh: 'shell', sql: 'sql', toml: 'ini',
  }
  return map[ext] ?? 'plaintext'
}
