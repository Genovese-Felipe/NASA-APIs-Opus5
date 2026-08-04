/**
 * Tiny DOM helpers.
 *
 * Not a framework — just enough to build elements declaratively without
 * `innerHTML`, which keeps the Content Security Policy strict and makes it
 * impossible to inject markup from an API response by accident.
 *
 * @module ui/dom
 */

/**
 * Create an element.
 *
 * @param {string} tag Tag name, optionally with `.class` suffixes
 *   (`'div.card.card--clickable'`).
 * @param {object|null} [props] Attributes and properties. `class`, `text`,
 *   `html` (used only for strings this application authored), `on` (event map),
 *   `style` (object), `data` (dataset), anything else becomes an attribute.
 * @param {Array<Node|string|null|undefined|false>} [children]
 * @returns {HTMLElement}
 */
export function el(tag, props = null, children = []) {
  const [name, ...classes] = tag.split('.');
  const node = document.createElement(name);
  if (classes.length) node.className = classes.join(' ');

  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === 'class') node.className = [node.className, value].filter(Boolean).join(' ');
      else if (key === 'text') node.textContent = value;
      else if (key === 'html') node.innerHTML = value;
      else if (key === 'on') {
        for (const [type, fn] of Object.entries(value)) node.addEventListener(type, fn);
      } else if (key === 'style' && typeof value === 'object') {
        Object.assign(node.style, value);
      } else if (key === 'data' && typeof value === 'object') {
        Object.assign(node.dataset, value);
      } else if (key in node && key !== 'list' && typeof value !== 'object') {
        node[key] = value;
      } else {
        node.setAttribute(key, String(value));
      }
    }
  }

  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(typeof child === 'string' || typeof child === 'number' ? String(child) : child);
  }
  return node;
}

/**
 * Replace an element's contents.
 * @param {HTMLElement} parent
 * @param {...(Node|string|null|undefined|false)} children
 */
export function replace(parent, ...children) {
  parent.textContent = '';
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    parent.append(typeof child === 'string' ? child : child);
  }
}

/**
 * A labelled section.
 * @param {string} title
 * @param {Array<Node|string|false|null>} children
 * @returns {HTMLElement}
 */
export function section(title, children) {
  return el('section.section', null, [
    title && el('h3.section__title', { text: title }),
    ...children,
  ]);
}

/**
 * A definition list of facts.
 * @param {Array<[string, string|Node]|null|false>} rows
 * @returns {HTMLElement}
 */
export function facts(rows) {
  const dl = el('dl.facts');
  for (const row of rows) {
    if (!row) continue;
    const [term, value] = row;
    dl.append(el('dt', { text: term }), el('dd', null, [value]));
  }
  return dl;
}

/**
 * A range control with a live value readout.
 * @param {object} opts
 * @param {string} opts.label
 * @param {number} opts.value
 * @param {number} opts.min
 * @param {number} opts.max
 * @param {number} [opts.step=0.01]
 * @param {(v:number)=>void} opts.onInput
 * @param {(v:number)=>string} [opts.format]
 * @returns {HTMLElement}
 */
export function slider({ label, value, min, max, step = 0.01, onInput, format }) {
  const out = el('span.field__value', { text: (format || fmtDefault)(value) });
  const input = el('input', {
    type: 'range',
    min: String(min),
    max: String(max),
    step: String(step),
    value: String(value),
    on: {
      input: (e) => {
        const v = parseFloat(e.target.value);
        out.textContent = (format || fmtDefault)(v);
        onInput(v);
      },
    },
  });
  return el('label.field', null, [
    el('span.field__label', null, [el('span', { text: label }), out]),
    input,
  ]);
}

/** @private */
function fmtDefault(v) {
  return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2);
}

/**
 * A checkbox row.
 * @param {string} label
 * @param {boolean} checked
 * @param {(v:boolean)=>void} onChange
 * @returns {HTMLElement}
 */
export function toggle(label, checked, onChange) {
  return el('label.check', null, [
    el('input', {
      type: 'checkbox',
      checked,
      on: { change: (e) => onChange(e.target.checked) },
    }),
    el('span', { text: label }),
  ]);
}

/**
 * A select control.
 * @param {object} opts
 * @param {string} opts.label
 * @param {string} opts.value
 * @param {Array<{value:string,label:string}>} opts.options
 * @param {(v:string)=>void} opts.onChange
 * @returns {HTMLElement}
 */
export function select({ label, value, options, onChange }) {
  const sel = el('select', {
    on: { change: (e) => onChange(e.target.value) },
  }, options.map((o) => el('option', { value: o.value, text: o.label, selected: o.value === value })));
  return el('label.field', null, [
    el('span.field__label', null, [el('span', { text: label })]),
    sel,
  ]);
}

/**
 * A button.
 * @param {string} label
 * @param {()=>void} onClick
 * @param {object} [opts]
 * @returns {HTMLElement}
 */
export function button(label, onClick, opts = {}) {
  return el(`button.btn${opts.primary ? '.btn--primary' : ''}${opts.block ? '.btn--block' : ''}${opts.ghost ? '.btn--ghost' : ''}`, {
    type: 'button',
    text: label,
    disabled: opts.disabled,
    on: { click: onClick },
    ...(opts.title ? { title: opts.title } : {}),
  });
}

/**
 * A simple bar chart from normalised values.
 * @param {number[]} values 0..1
 * @param {string[]} [titles]
 * @returns {HTMLElement}
 */
export function barChart(values, titles = []) {
  const max = Math.max(...values, 1e-6);
  return el('div.bar-chart', null, values.map((v, i) =>
    el('div.bar-chart__bar', {
      style: { height: `${Math.max(2, (v / max) * 100)}%` },
      title: titles[i] || '',
    })
  ));
}

/**
 * A sparkline as inline SVG.
 * @param {number[]} values
 * @param {object} [opts]
 * @returns {SVGElement}
 */
export function sparkline(values, opts = {}) {
  const w = 300;
  const h = 40;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('class', 'spark');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  if (!values.length) return svg;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((v, i) => {
    const x = (i / Math.max(values.length - 1, 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  path.setAttribute('points', points.join(' '));
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', opts.color || 'currentColor');
  path.setAttribute('stroke-width', '1.5');
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.appendChild(path);
  return svg;
}
