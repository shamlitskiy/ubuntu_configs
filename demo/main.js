// Minimal standalone Visual SQL demo
// Core types (JS, no TS build needed)

const DIALECTS = {
  postgres: {
    quoteId: (s) => '"' + String(s).replaceAll('"', '""') + '"',
    param: (i) => `$${i}`,
    limitOffset(limit, offset) {
      const parts = [];
      if (limit != null && limit !== '') parts.push(`LIMIT ${Number(limit)}`);
      if (offset != null && offset !== '') parts.push(`OFFSET ${Number(offset)}`);
      return parts.join(' ');
    },
  },
  mysql: {
    quoteId: (s) => '`' + String(s).replaceAll('`', '``') + '`',
    param: () => '?',
    limitOffset(limit, offset) {
      if ((limit == null || limit === '') && (offset == null || offset === '')) return '';
      if (limit != null && limit !== '' && offset != null && offset !== '') return `LIMIT ${Number(offset)}, ${Number(limit)}`;
      if (limit != null && limit !== '') return `LIMIT ${Number(limit)}`;
      return `LIMIT ${Number(offset)}, 18446744073709551615`;
    },
  },
  sqlite: {
    quoteId: (s) => '"' + String(s).replaceAll('"', '""') + '"',
    param: () => '?',
    limitOffset(limit, offset) {
      const parts = [];
      if (limit != null && limit !== '') parts.push(`LIMIT ${Number(limit)}`);
      if (offset != null && offset !== '') parts.push(`OFFSET ${Number(offset)}`);
      return parts.join(' ');
    },
  },
};

function buildIdentifier(schema, name, d) {
  const q = DIALECTS[d];
  if (!name) return '';
  if (schema && schema.trim()) {
    return q.quoteId(schema.trim()) + '.' + q.quoteId(name.trim());
  }
  return q.quoteId(name.trim());
}

function renderExpr(expr, ctx) {
  // expr: { kind: 'col'|'val'|'bin'|'and'|'or'|'isNull'|'in', ... }
  const d = DIALECTS[ctx.dialect];
  switch (expr?.kind) {
    case 'col': {
      const prefix = expr.tableAlias ? d.quoteId(expr.tableAlias) + '.' : '';
      return prefix + d.quoteId(expr.name);
    }
    case 'val': {
      ctx.params.push(expr.value);
      return d.param(ctx.params.length);
    }
    case 'bin': {
      return `(${renderExpr(expr.left, ctx)} ${expr.op} ${renderExpr(expr.right, ctx)})`;
    }
    case 'and':
      return `(${renderExpr(expr.left, ctx)} AND ${renderExpr(expr.right, ctx)})`;
    case 'or':
      return `(${renderExpr(expr.left, ctx)} OR ${renderExpr(expr.right, ctx)})`;
    case 'isNull':
      return `(${renderExpr(expr.expr, ctx)} IS ${expr.not ? 'NOT ' : ''}NULL)`;
    case 'in':
      return `(${renderExpr(expr.expr, ctx)} IN (${(expr.values||[]).map(v => renderExpr(v, ctx)).join(', ')}))`;
    default:
      return '/* expr */';
  }
}

function toSql(select, dialect) {
  const d = DIALECTS[dialect];
  const params = [];
  const ctx = { dialect, params };

  const columns = (select.columns || []).map(c => {
    const sql = renderExpr(c.expr, ctx);
    return c.alias ? `${sql} AS ${d.quoteId(c.alias)}` : sql;
  }).join(', ');

  const from = (() => {
    const t = select.from || {};
    const base = buildIdentifier(t.schema, t.name, dialect);
    const alias = t.alias ? ` ${d.quoteId(t.alias)}` : '';
    return `FROM ${base}${alias}`;
  })();

  const joins = (select.joins || []).map(j => {
    const jt = (j.type || 'inner').toUpperCase();
    const base = buildIdentifier(j.schema, j.name, dialect);
    const alias = j.alias ? ` ${d.quoteId(j.alias)}` : '';
    const on = renderExpr(j.on, ctx);
    return `${jt} JOIN ${base}${alias} ON ${on}`;
  }).join('\n');

  const where = select.where ? `WHERE ${renderExpr(select.where, ctx)}` : '';
  const groupBy = (select.groupBy && select.groupBy.length) ? `GROUP BY ${select.groupBy.map(e => renderExpr(e, ctx)).join(', ')}` : '';
  const orderBy = (select.orderBy && select.orderBy.length) ? `ORDER BY ${select.orderBy.map(o => `${renderExpr(o.expr, ctx)} ${(o.dir||'ASC').toUpperCase()}`).join(', ')}` : '';
  const lo = DIALECTS[dialect].limitOffset(select.limit, select.offset);

  const sql = [
    `SELECT ${columns || '*'}`,
    from,
    joins,
    where,
    groupBy,
    orderBy,
    lo,
  ].filter(Boolean).join('\n');

  return { sql, params };
}

// Demo schema (client-provided; in real app load via JSON)
const SCHEMA = {
  entities: [
    {
      name: 'users',
      columns: ['id','name','email','country','org_id','deleted_at']
    },
    {
      name: 'orgs',
      columns: ['id','name']
    },
    {
      name: 'orders',
      columns: ['id','user_id','total','created_at','status']
    }
  ],
};

function $(id) { return document.getElementById(id); }

function fillTables(selectEl) {
  selectEl.innerHTML = '';
  for (const e of SCHEMA.entities) {
    const opt = document.createElement('option');
    opt.value = e.name;
    opt.textContent = e.name;
    selectEl.appendChild(opt);
  }
}

function buildColumnPicker(tableSelectId, aliasInputId) {
  const container = document.createElement('div');
  container.className = 'item';

  const row = document.createElement('div');
  row.className = 'row';

  const tableSel = document.createElement('select');
  fillTables(tableSel);

  const colSel = document.createElement('select');

  function refreshColumns() {
    const t = tableSel.value;
    const ent = SCHEMA.entities.find(e => e.name === t);
    colSel.innerHTML = '';
    if (!ent) return;
    for (const c of ent.columns) {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      colSel.appendChild(opt);
    }
  }

  tableSel.addEventListener('change', refreshColumns);
  setTimeout(refreshColumns, 0);

  const aliasIn = document.createElement('input');
  aliasIn.placeholder = 'алиас (опц.)';

  const delBtn = document.createElement('button');
  delBtn.textContent = 'удалить';
  delBtn.className = 'ghost';
  delBtn.addEventListener('click', () => container.remove());

  row.appendChild(tableSel);
  row.appendChild(colSel);
  row.appendChild(aliasIn);
  container.appendChild(row);
  container.appendChild(delBtn);

  return { el: container, read() {
    return {
      expr: { kind: 'col', tableAlias: undefined, name: colSel.value, table: tableSel.value },
      alias: aliasIn.value || undefined,
      table: tableSel.value,
    };
  }};
}

function buildJoinRow() {
  const container = document.createElement('div');
  container.className = 'item';

  const row1 = document.createElement('div');
  row1.className = 'row';
  const typeSel = document.createElement('select');
  for (const t of ['inner','left','right','full']) {
    const opt = document.createElement('option'); opt.value = t; opt.textContent = t.toUpperCase(); typeSel.appendChild(opt);
  }

  const tableSel = document.createElement('select');
  fillTables(tableSel);
  const aliasIn = document.createElement('input'); aliasIn.placeholder = 'алиас (опц.)';

  row1.appendChild(typeSel);
  row1.appendChild(tableSel);
  row1.appendChild(aliasIn);

  const row2 = document.createElement('div');
  row2.className = 'row';

  const lTable = document.createElement('select'); fillTables(lTable);
  const lCol = document.createElement('select');
  const rTable = document.createElement('select'); fillTables(rTable);
  const rCol = document.createElement('select');

  function refreshCols(selTable, selCol) {
    const ent = SCHEMA.entities.find(e => e.name === selTable.value);
    selCol.innerHTML = '';
    if (!ent) return;
    for (const c of ent.columns) {
      const opt = document.createElement('option'); opt.value = c; opt.textContent = c; selCol.appendChild(opt);
    }
  }

  lTable.addEventListener('change', () => refreshCols(lTable, lCol));
  rTable.addEventListener('change', () => refreshCols(rTable, rCol));
  setTimeout(() => { refreshCols(lTable, lCol); refreshCols(rTable, rCol); }, 0);

  const eq = document.createElement('span'); eq.textContent = '='; eq.style.margin = '0 6px';

  const delBtn = document.createElement('button'); delBtn.textContent = 'удалить'; delBtn.className = 'ghost';
  delBtn.addEventListener('click', () => container.remove());

  row2.appendChild(lTable); row2.appendChild(lCol); row2.appendChild(eq); row2.appendChild(rTable); row2.appendChild(rCol);
  container.appendChild(row1);
  container.appendChild(row2);
  container.appendChild(delBtn);

  return { el: container, read() {
    return {
      type: typeSel.value,
      schema: undefined,
      name: tableSel.value,
      alias: aliasIn.value || undefined,
      on: { kind: 'bin', op: '=', left: { kind: 'col', tableAlias: undefined, name: lCol.value, tableAliasName: lTable.value }, right: { kind: 'col', tableAlias: undefined, name: rCol.value, tableAliasName: rTable.value } },
    };
  }};
}

function buildFilterRow() {
  const container = document.createElement('div');
  container.className = 'item';
  const row = document.createElement('div'); row.className = 'row';

  const tableSel = document.createElement('select'); fillTables(tableSel);
  const colSel = document.createElement('select');
  function refreshColumns() {
    const ent = SCHEMA.entities.find(e => e.name === tableSel.value);
    colSel.innerHTML = '';
    if (!ent) return;
    for (const c of ent.columns) {
      const opt = document.createElement('option'); opt.value = c; opt.textContent = c; colSel.appendChild(opt);
    }
  }
  tableSel.addEventListener('change', refreshColumns); setTimeout(refreshColumns, 0);

  const opSel = document.createElement('select');
  for (const v of ['=','<>','<','>','<=','>=','LIKE']) { const opt = document.createElement('option'); opt.value = v; opt.textContent = v; opSel.appendChild(opt); }
  const valIn = document.createElement('input'); valIn.placeholder = 'значение';

  const delBtn = document.createElement('button'); delBtn.textContent = 'удалить'; delBtn.className = 'ghost'; delBtn.addEventListener('click', () => container.remove());

  row.appendChild(tableSel); row.appendChild(colSel); row.appendChild(opSel); row.appendChild(valIn);
  container.appendChild(row); container.appendChild(delBtn);

  return { el: container, read() {
    const raw = valIn.value;
    let value = raw;
    if (raw === '') value = '';
    else if (!Number.isNaN(Number(raw))) value = Number(raw);
    return {
      kind: 'bin',
      op: opSel.value,
      left: { kind: 'col', tableAlias: undefined, name: colSel.value, table: tableSel.value },
      right: { kind: 'val', value },
    };
  }};
}

function initUI() {
  const dialectSel = $('dialect');
  const fromTable = $('fromTable');
  const fromAlias = $('fromAlias');
  const joinsDiv = $('joins');
  const columnsDiv = $('columns');
  const filtersDiv = $('filters');
  const addJoin = $('addJoin');
  const addColumn = $('addColumn');
  const addFilter = $('addFilter');
  const limitIn = $('limit');
  const offsetIn = $('offset');
  const sqlOut = $('sqlOut');
  const paramsOut = $('paramsOut');
  const warnings = $('warnings');

  // seed tables
  fillTables(fromTable);

  const joinRows = [];
  const columnRows = [];
  const filterRows = [];

  function addJoinRow() { const row = buildJoinRow(); joinRows.push(row); joinsDiv.appendChild(row.el); }
  function addColumnRow() { const row = buildColumnPicker(); columnRows.push(row); columnsDiv.appendChild(row.el); }
  function addFilterRow() { const row = buildFilterRow(); filterRows.push(row); filtersDiv.appendChild(row.el); }

  addJoin.addEventListener('click', addJoinRow);
  addColumn.addEventListener('click', addColumnRow);
  addFilter.addEventListener('click', addFilterRow);

  // add defaults
  addColumnRow();

  function validate(select) {
    const issues = [];
    if (!select.from?.name) issues.push('FROM не задан');
    // Simple validation: if joins refer to same-side columns, warn if tables equal and columns mismatch type (skipped in demo)
    return issues;
  }

  function generate() {
    const select = {
      from: { name: fromTable.value, alias: fromAlias.value || undefined },
      joins: joinRows.map(j => j.read()),
      columns: columnRows.map(c => ({ expr: { ...c.read().expr }, alias: c.read().alias })),
      where: (() => {
        if (filterRows.length === 0) return undefined;
        const exprs = filterRows.map(f => f.read());
        return exprs.reduce((acc, e) => acc ? ({ kind: 'and', left: acc, right: e }) : e, undefined);
      })(),
      limit: limitIn.value,
      offset: offsetIn.value,
    };

    const issues = validate(select);
    warnings.textContent = issues.join(' \n ');

    const { sql, params } = toSql(select, dialectSel.value);
    sqlOut.value = sql;
    paramsOut.textContent = 'params: ' + JSON.stringify(params);
  }

  $('generateBtn').addEventListener('click', generate);

  $('formatBtn').addEventListener('click', () => {
    // simple formatting: not a real formatter
    sqlOut.value = sqlOut.value
      .replaceAll(/\b(FROM|WHERE|GROUP BY|ORDER BY|INNER JOIN|LEFT JOIN|RIGHT JOIN|FULL JOIN|LIMIT|OFFSET)\b/g, '\n$1')
      .replaceAll(/\n\n+/g, '\n')
      .trim();
  });

  $('copyBtn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(sqlOut.value);
      paramsOut.textContent = 'Скопировано в буфер обмена';
      setTimeout(() => { paramsOut.textContent = ''; }, 1200);
    } catch (e) {
      paramsOut.textContent = 'Не удалось скопировать';
    }
  });

  // initial render
  $('schemaName').textContent = 'Demo schema';
}

window.addEventListener('DOMContentLoaded', initUI);
