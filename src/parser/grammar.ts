// Grammar source embedded as a string so it ships with the compiled dist.
// Edit grammar.pegjs for readability, then update this constant to match.
// String.raw preserves \t \n \r as literal escape sequences that peggy needs.
export const GRAMMAR = String.raw`
{{
  // Module-level code (available in generated parser)
}}
{
  // Per-parse initializer
}

SdlDocument
  = _ items:SdlItem* _ { return items; }

SdlItem
  = ScalarEnum / ObjectType

// ─── Scalar Enums ────────────────────────────────────────────────────────────

ScalarEnum
  = _ "scalar" __ "type" __ name:Identifier __ "extending" __ "enum" _ "<" _
    first:Identifier rest:(_ "," _ id:Identifier { return id; })* _
    ">" _ ";" _
  {
    return { kind: "scalar_enum", name, values: [first, ...rest] };
  }

// ─── Object Types ─────────────────────────────────────────────────────────────

ObjectType
  = _ "type" __ name:Identifier _ "{" _ members:TypeMember* _ "}" _
  {
    const properties = members.filter(m => m != null && m.kind === "property");
    const indexes    = members.filter(m => m != null && (m.kind === "index_fts" || m.kind === "index_vec"));
    const constraints = members.filter(m => m != null && m.kind === "constraint_exclusive");
    return { kind: "object_type", name, properties, links: [], indexes, constraints };
  }

TypeMember
  = IndexDecl / ConstraintDecl / PropertyDecl

// ─── Properties ───────────────────────────────────────────────────────────────
// PropertyDecl handles ALL field declarations: scalars, vectors, and uppercase
// type references (enum refs and object links). parseSdl() separates the latter.

PropertyDecl
  = _ required:("required" __)? name:Identifier _ ":" _ type:TypeExpr
    opts:PropertyOpts? _ ";" _
  {
    const base = {
      kind: "property",
      name,
      type,
      required: required != null,
    };
    if (opts && opts.default !== undefined) {
      return { ...base, default: opts.default };
    }
    return base;
  }

PropertyOpts
  = _ "{" _ "default" _ ":=" _ val:DefaultValue _ "}" _
  { return { default: val }; }

DefaultValue
  = StringLiteral / NumberLiteral / BoolLiteral / JsonLiteral

StringLiteral
  = "'" chars:[^']* "'" { return chars.join(""); }

NumberLiteral
  = digits:[0-9]+ { return parseInt(digits.join(""), 10); }

BoolLiteral
  = "true"  { return true;  }
  / "false" { return false; }

JsonLiteral
  = "'" _ "{" _ "}" _ "'" { return "{}"; }

TypeExpr
  = VectorType / ScalarType

VectorType
  = "vector" _ "(" _ dim:NumberLiteral _ ")"
  { return { kind: "vector", dimensions: dim }; }

ScalarType
  = "str"   { return "str";   }
  / "int64" { return "int64"; }
  / "bool"  { return "bool";  }
  / "json"  { return "json";  }
  / name:Identifier { return name; }

// ─── Indexes ──────────────────────────────────────────────────────────────────

IndexDecl
  = FtsIndex / VecIndex

FtsIndex
  = _ "index" __ "fts" __ "on" _ "(" _ "." prop:Identifier _ ")" _ ";" _
  { return { kind: "index_fts", property: prop }; }

VecIndex
  = _ "index" __ "vec" __ "on" _ "(" _ "." prop:Identifier _ ")"
    __ "using" __ using:Identifier _ ";" _
  { return { kind: "index_vec", property: prop, using }; }

// ─── Constraints ──────────────────────────────────────────────────────────────

ConstraintDecl
  = _ "constraint" __ "exclusive" __ "on" _ "(" _ "(" _
    first:ConstraintProp rest:(_ "," _ p:ConstraintProp { return p; })* _
    ")" _ ")" _ ";" _
  { return { kind: "constraint_exclusive", properties: [first, ...rest] }; }

ConstraintProp
  = "." name:Identifier { return name; }

// ─── Terminals ────────────────────────────────────────────────────────────────

Identifier "identifier"
  = first:[a-zA-Z_] rest:[a-zA-Z0-9_]* { return first + rest.join(""); }

__ "whitespace"
  = [ \t\n\r]+

_ "optional whitespace"
  = [ \t\n\r]* (Comment _)*

Comment
  = "#" [^\n]* "\n"?
`;
