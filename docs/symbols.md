# The declaration an operation is about (`symbol`)

Each operation `semanticDiffFile` returns can carry an optional `symbol`: the declaration the operation is
about, for a host that names it ("greet moved", not "Greeter moved"). It is additive. Pierre's operation shape
is unchanged, every other field stays as it was, and `symbol` is left out, not set to `undefined`, when there
is none.

```ts
type SymbolKind =
  | 'function' | 'method' | 'constructor' | 'class' | 'interface' | 'enum' | 'struct'
  | 'property' | 'field' | 'variable' | 'type' | 'module' | 'namespace' | 'import' | 'other';

interface OperationSymbol {
  name: string;       // the declaration's own name, without class, receiver or namespace: "greet"
  kind: SymbolKind;
  oldName?: string;   // renamed only: the name before (`name` is the name after)
  container?: string; // enclosing declarations, outermost first, joined with "." ("Greeter", "User.Companion")
}

type SemDiffOperation = SemanticDiffOperation & { symbol?: OperationSymbol };
```

**When the engine is unsure which declaration an operation is about, it leaves `symbol` out.** A wrong name is
shown to the person, and no name is better than a wrong one.

## Which declaration

The declarations are the ones the engine already reads for each language (classes, functions, methods,
properties, imports and so on, with their members). Functions nested inside a function also count. A
declaration's lines include the comments and attributes directly above it.

| Operation | `symbol` |
|---|---|
| moved, movedWithEdit | The one whole declaration the lines are. For statements moved within code, the innermost function, method or constructor holding them. Both sides must give the same answer, so a block moved from one function into another gets none. |
| extractedFunction | The helper: the one new function the operation fully holds. |
| inlinedFunction | The helper: the one removed function the operation fully holds. |
| renamed | Only when one name changed. `name` is the new name and `oldName` the old one. The kind comes from where the old name is declared: a declaration's kind, or `variable` for a local or a parameter. |
| renamed, several names | None. |
| reformatted, edited | The innermost declaration holding every line. None when the lines reach into more than one of its members, unless they are that declaration whole. A whole class reflowed is that class. |
| added | Only when the lines are exactly one whole declaration (new side). |
| deleted | Only when the lines are exactly one whole declaration (old side). |
| anything else | None. |

`container` gives the enclosing declarations (`Greeter`, `User.Companion`). It is the receiver type for a Kotlin
extension function or property (`String` for `fun String.shout()`). For a member of a Swift extension it is the
extended type, and for a member of a Rust `impl` it is the type implemented.

## Kinds per language

| Language | Mapping |
|---|---|
| TypeScript, TSX, JavaScript | function declaration → function; `const f = () => …` → function; class field holding an arrow → method; method → method (`constructor` → constructor); class → class; interface → interface; enum → enum; type alias → type; other const/let/var → variable; class field → field; namespace/module → namespace; import, re-export → import |
| Python | def → function, or method inside a class (`__init__` → constructor); class → class; assignment → variable, or field inside a class; import → import |
| Go | func → function; method → method (container: the receiver type); type → struct, interface or type; const/var → variable; import → import |
| Rust | fn → function, or method inside `impl`/`trait`; struct/union → struct; enum → enum; trait → interface; mod → module; const/static → variable; type → type; use → import. `impl` blocks and macros get none. |
| Java | method → method; constructor → constructor; class/record → class; interface/annotation type → interface; enum → enum; field → field; import → import |
| C# | method → method; local function → function; constructor → constructor; class/record → class; struct → struct; interface → interface; enum → enum; property → property; field → field; delegate → type; namespace → namespace; using → import |
| PHP | function → function; method → method (`__construct` → constructor); class, trait → class; interface → interface; enum → enum; enum case → field; property → property; class constant → field, top-level const → variable; namespace → namespace; use → import; trait use → other |
| Ruby | def → method inside a class or module, function at the top level (`def self.x` → method `x`); class → class; module → module; constant → variable; `attr_*` naming one attribute → property; `define_method` → method; require/include → import. `class << self`, visibility lines and `attr_*` naming several attributes get none. |
| Kotlin | fun → method inside a class, object or companion, function at the top level; secondary constructor → constructor; `init` → other; class, object, companion → class (a companion is named `Companion` unless it has a name); interface → interface; enum class → enum; property → property; typealias → type; enum entry → field; import → import. Destructuring declarations get none. |
| Swift | func → method inside a type or extension, function at the top level; init → constructor; class/actor → class; struct → struct; enum → enum; protocol → interface; extension → other; property → property in a type, variable at the top level; enum case → field (none when one `case` line holds several); typealias/associatedtype → type; import → import. Subscripts, deinit and operators get none. |

The cases in `test/fixtures/symbols/cases.json`, per language, check the name, kind and container, and the cases
where the engine must give none: two sibling declarations added in one block, statements moved from one method
into another, and two names renamed together.
