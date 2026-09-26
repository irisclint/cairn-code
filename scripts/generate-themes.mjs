/**
 * Expands the compact theme palettes below into complete theme JSON files.
 *
 * A full Causeway theme defines roughly 90 workbench colours. Writing each of them
 * by hand for twelve themes would guarantee drift, so every theme declares only
 * its palette (backgrounds, accents, syntax colours, ANSI set) and this script
 * derives the rest through one shared layout. Editing the derivation here fixes
 * every theme at once.
 *
 * Run with: node scripts/generate-themes.mjs
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'src', 'renderer', 'theme-engine', 'themes');

/**
 * @typedef {object} Palette
 * @property {string} id
 * @property {string} name
 * @property {'dark'|'light'|'high-contrast-dark'|'high-contrast-light'} type
 * @property {string} description
 * @property {string} bg          Editor background
 * @property {string} bgAlt       Sidebar and panel background
 * @property {string} bgDeep      Activity bar and title bar background
 * @property {string} bgRaised    Widgets, dropdowns, inactive tabs
 * @property {string} fg          Primary foreground
 * @property {string} fgMuted     Secondary foreground
 * @property {string} border      Divider colour
 * @property {string} accent      Primary accent (status bar, focus border)
 * @property {string} accentFg    Foreground on the accent colour
 * @property {string} selection   Editor selection background
 * @property {string} lineHl      Current line highlight
 * @property {string} error
 * @property {string} warning
 * @property {string} info
 * @property {string} success
 * @property {object} syntax
 * @property {string[]} ansi      Sixteen ANSI colours, normal then bright
 */

/** @type {Palette[]} */
const PALETTES = [
  {
    id: 'dark-modern',
    name: 'Dark Modern',
    type: 'dark',
    description: 'The Causeway signature theme. Deep neutral greys with a blue to violet accent.',
    bg: '#1a1b26',
    bgAlt: '#16161e',
    bgDeep: '#13131a',
    bgRaised: '#20212e',
    fg: '#c8d0e0',
    fgMuted: '#7a819b',
    border: '#282a3a',
    accent: '#3b82f6',
    accentFg: '#ffffff',
    selection: '#2d4a7c',
    lineHl: '#20212e',
    error: '#f45c6a',
    warning: '#e0af68',
    info: '#3b82f6',
    success: '#10b981',
    syntax: {
      keyword: '#8b5cf6',
      control: '#a78bfa',
      string: '#9ece6a',
      number: '#ff9e64',
      comment: '#5c6370',
      function: '#7aa2f7',
      type: '#2dd4bf',
      variable: '#c8d0e0',
      parameter: '#e0af68',
      property: '#7dcfff',
      constant: '#ff9e64',
      tag: '#f7768e',
      attribute: '#bb9af7',
      operator: '#89ddff',
      regexp: '#b4f9f8'
    },
    ansi: [
      '#16161e', '#f45c6a', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#a9b1d6',
      '#414868', '#ff7a85', '#b9f27c', '#ffc777', '#8fb4ff', '#d3a7ff', '#9ce6ff', '#e6eaf5'
    ]
  },
  {
    id: 'light-modern',
    name: 'Light Modern',
    type: 'light',
    description: 'The Causeway signature light theme. Warm white with the same blue to violet accent.',
    bg: '#ffffff',
    bgAlt: '#f5f6f8',
    bgDeep: '#eceef2',
    bgRaised: '#ffffff',
    fg: '#24283b',
    fgMuted: '#6b7189',
    border: '#dfe2e9',
    accent: '#2563eb',
    accentFg: '#ffffff',
    selection: '#bcd4f6',
    lineHl: '#f2f5fb',
    error: '#d1293d',
    warning: '#a16207',
    info: '#2563eb',
    success: '#047857',
    syntax: {
      keyword: '#7c3aed',
      control: '#6d28d9',
      string: '#0f7b3f',
      number: '#b45309',
      comment: '#8a91a4',
      function: '#1d4ed8',
      type: '#0f766e',
      variable: '#24283b',
      parameter: '#a16207',
      property: '#0369a1',
      constant: '#b45309',
      tag: '#be123c',
      attribute: '#7c3aed',
      operator: '#0e7490',
      regexp: '#0f766e'
    },
    ansi: [
      '#24283b', '#d1293d', '#0f7b3f', '#a16207', '#2563eb', '#7c3aed', '#0e7490', '#eceef2',
      '#6b7189', '#e11d48', '#15803d', '#b45309', '#3b82f6', '#8b5cf6', '#0891b2', '#ffffff'
    ]
  },
  {
    id: 'midnight-violet',
    name: 'Midnight Violet',
    type: 'dark',
    description: 'A saturated violet night theme with high chroma syntax colours.',
    bg: '#17141f',
    bgAlt: '#131020',
    bgDeep: '#0f0d1a',
    bgRaised: '#1f1a2e',
    fg: '#d6d0e8',
    fgMuted: '#8a81a8',
    border: '#2a2440',
    accent: '#a855f7',
    accentFg: '#ffffff',
    selection: '#3f2d66',
    lineHl: '#201b30',
    error: '#ff5c8a',
    warning: '#f0b45e',
    info: '#a855f7',
    success: '#4ade80',
    syntax: {
      keyword: '#c084fc',
      control: '#e879f9',
      string: '#86efac',
      number: '#fbbf24',
      comment: '#6b5e8c',
      function: '#60a5fa',
      type: '#5eead4',
      variable: '#d6d0e8',
      parameter: '#fbbf24',
      property: '#93c5fd',
      constant: '#fb923c',
      tag: '#ff5c8a',
      attribute: '#c084fc',
      operator: '#67e8f9',
      regexp: '#a5f3fc'
    },
    ansi: [
      '#1f1a2e', '#ff5c8a', '#86efac', '#fbbf24', '#60a5fa', '#c084fc', '#67e8f9', '#d6d0e8',
      '#4c4270', '#ff8fae', '#bbf7d0', '#fde68a', '#93c5fd', '#e9d5ff', '#a5f3fc', '#f5f3ff'
    ]
  },
  {
    id: 'nordic',
    name: 'Nordic',
    type: 'dark',
    description: 'Cool arctic blues with low contrast, tuned for long sessions in dim rooms.',
    bg: '#2e3440',
    bgAlt: '#2b303b',
    bgDeep: '#272c36',
    bgRaised: '#3b4252',
    fg: '#d8dee9',
    fgMuted: '#7b8494',
    border: '#3b4252',
    accent: '#5e81ac',
    accentFg: '#eceff4',
    selection: '#434c5e',
    lineHl: '#353b49',
    error: '#bf616a',
    warning: '#ebcb8b',
    info: '#5e81ac',
    success: '#a3be8c',
    syntax: {
      keyword: '#81a1c1',
      control: '#b48ead',
      string: '#a3be8c',
      number: '#b48ead',
      comment: '#616e88',
      function: '#88c0d0',
      type: '#8fbcbb',
      variable: '#d8dee9',
      parameter: '#d8dee9',
      property: '#8fbcbb',
      constant: '#b48ead',
      tag: '#81a1c1',
      attribute: '#8fbcbb',
      operator: '#81a1c1',
      regexp: '#ebcb8b'
    },
    ansi: [
      '#3b4252', '#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#88c0d0', '#e5e9f0',
      '#4c566a', '#d08770', '#b9d3a0', '#f0d8a8', '#8fbcbb', '#c9a4c4', '#9fd6e0', '#eceff4'
    ]
  },
  {
    id: 'solar-dusk',
    name: 'Solar Dusk',
    type: 'dark',
    description: 'Warm amber and teal on a deep brown base, inspired by low evening sun.',
    bg: '#002b36',
    bgAlt: '#01252e',
    bgDeep: '#011f27',
    bgRaised: '#073642',
    fg: '#93a1a1',
    fgMuted: '#586e75',
    border: '#073642',
    accent: '#b58900',
    accentFg: '#002b36',
    selection: '#0a4a5a',
    lineHl: '#043440',
    error: '#dc322f',
    warning: '#b58900',
    info: '#268bd2',
    success: '#859900',
    syntax: {
      keyword: '#859900',
      control: '#cb4b16',
      string: '#2aa198',
      number: '#d33682',
      comment: '#586e75',
      function: '#268bd2',
      type: '#b58900',
      variable: '#93a1a1',
      parameter: '#cb4b16',
      property: '#268bd2',
      constant: '#d33682',
      tag: '#268bd2',
      attribute: '#93a1a1',
      operator: '#859900',
      regexp: '#dc322f'
    },
    ansi: [
      '#073642', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#eee8d5',
      '#586e75', '#cb4b16', '#93a1a1', '#c9a227', '#3a9bdc', '#e05a9a', '#3fc4ba', '#fdf6e3'
    ]
  },
  {
    id: 'solar-dawn',
    name: 'Solar Dawn',
    type: 'light',
    description: 'The light counterpart to Solar Dusk, on a soft parchment background.',
    bg: '#fdf6e3',
    bgAlt: '#f5eed8',
    bgDeep: '#eee8d5',
    bgRaised: '#fffbf0',
    fg: '#586e75',
    fgMuted: '#93a1a1',
    border: '#e4dcc4',
    accent: '#b58900',
    accentFg: '#fdf6e3',
    selection: '#e6dcc0',
    lineHl: '#f5eed8',
    error: '#dc322f',
    warning: '#a16207',
    info: '#268bd2',
    success: '#6f7c00',
    syntax: {
      keyword: '#859900',
      control: '#cb4b16',
      string: '#2aa198',
      number: '#d33682',
      comment: '#93a1a1',
      function: '#268bd2',
      type: '#b58900',
      variable: '#586e75',
      parameter: '#cb4b16',
      property: '#268bd2',
      constant: '#d33682',
      tag: '#268bd2',
      attribute: '#586e75',
      operator: '#859900',
      regexp: '#dc322f'
    },
    ansi: [
      '#073642', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#eee8d5',
      '#586e75', '#cb4b16', '#93a1a1', '#c9a227', '#3a9bdc', '#e05a9a', '#3fc4ba', '#fdf6e3'
    ]
  },
  {
    id: 'forest',
    name: 'Forest',
    type: 'dark',
    description: 'Deep green canopy tones with moss and bark accents.',
    bg: '#12211a',
    bgAlt: '#0e1b15',
    bgDeep: '#0a1611',
    bgRaised: '#1a2e24',
    fg: '#c5d8cb',
    fgMuted: '#7a8f82',
    border: '#1f382b',
    accent: '#4ade80',
    accentFg: '#0a1611',
    selection: '#265c3f',
    lineHl: '#1a2e24',
    error: '#f87171',
    warning: '#fbbf24',
    info: '#38bdf8',
    success: '#4ade80',
    syntax: {
      keyword: '#6ee7b7',
      control: '#34d399',
      string: '#fcd34d',
      number: '#fb923c',
      comment: '#5a6f62',
      function: '#7dd3fc',
      type: '#a7f3d0',
      variable: '#c5d8cb',
      parameter: '#fcd34d',
      property: '#7dd3fc',
      constant: '#fb923c',
      tag: '#f87171',
      attribute: '#a7f3d0',
      operator: '#5eead4',
      regexp: '#fcd34d'
    },
    ansi: [
      '#1a2e24', '#f87171', '#4ade80', '#fcd34d', '#38bdf8', '#6ee7b7', '#5eead4', '#c5d8cb',
      '#3a5648', '#fca5a5', '#86efac', '#fde68a', '#7dd3fc', '#a7f3d0', '#99f6e4', '#e6f5ea'
    ]
  },
  {
    id: 'crimson',
    name: 'Crimson',
    type: 'dark',
    description: 'Near-black base with crimson and gold highlights for maximum focus.',
    bg: '#1a1416',
    bgAlt: '#161012',
    bgDeep: '#120d0f',
    bgRaised: '#251b1e',
    fg: '#e0d2d5',
    fgMuted: '#8f7c80',
    border: '#33242a',
    accent: '#e11d48',
    accentFg: '#ffffff',
    selection: '#5c2333',
    lineHl: '#251b1e',
    error: '#fb7185',
    warning: '#fbbf24',
    info: '#60a5fa',
    success: '#4ade80',
    syntax: {
      keyword: '#fb7185',
      control: '#f43f5e',
      string: '#fcd34d',
      number: '#fb923c',
      comment: '#6e5b60',
      function: '#f9a8d4',
      type: '#5eead4',
      variable: '#e0d2d5',
      parameter: '#fcd34d',
      property: '#93c5fd',
      constant: '#fb923c',
      tag: '#f43f5e',
      attribute: '#f9a8d4',
      operator: '#67e8f9',
      regexp: '#fcd34d'
    },
    ansi: [
      '#251b1e', '#fb7185', '#4ade80', '#fcd34d', '#60a5fa', '#f9a8d4', '#67e8f9', '#e0d2d5',
      '#4d3940', '#fda4af', '#86efac', '#fde68a', '#93c5fd', '#fbcfe8', '#a5f3fc', '#fff1f2'
    ]
  },
  {
    id: 'monochrome',
    name: 'Monochrome',
    type: 'dark',
    description: 'Pure greyscale. Syntax is carried entirely by weight and brightness.',
    bg: '#161616',
    bgAlt: '#121212',
    bgDeep: '#0e0e0e',
    bgRaised: '#1f1f1f',
    fg: '#d4d4d4',
    fgMuted: '#808080',
    border: '#2a2a2a',
    accent: '#8a8a8a',
    accentFg: '#0e0e0e',
    selection: '#3a3a3a',
    lineHl: '#1f1f1f',
    error: '#e06c6c',
    warning: '#c9a227',
    info: '#9a9a9a',
    success: '#8ab88a',
    syntax: {
      keyword: '#ffffff',
      control: '#f0f0f0',
      string: '#b8b8b8',
      number: '#c8c8c8',
      comment: '#6a6a6a',
      function: '#e8e8e8',
      type: '#d8d8d8',
      variable: '#d4d4d4',
      parameter: '#b0b0b0',
      property: '#c4c4c4',
      constant: '#c8c8c8',
      tag: '#ffffff',
      attribute: '#b8b8b8',
      operator: '#9a9a9a',
      regexp: '#b8b8b8'
    },
    ansi: [
      '#1f1f1f', '#e06c6c', '#8ab88a', '#c9a227', '#8a9ab8', '#a88ab8', '#8ab8b8', '#d4d4d4',
      '#4a4a4a', '#f08c8c', '#a8d0a8', '#e0c050', '#a8b8d0', '#c0a8d0', '#a8d0d0', '#f4f4f4'
    ]
  },
  {
    id: 'oceanic',
    name: 'Oceanic',
    type: 'dark',
    description: 'Deep sea blues with coral highlights and a wide mid-tone range.',
    bg: '#0f1c2e',
    bgAlt: '#0c1826',
    bgDeep: '#09131f',
    bgRaised: '#16273d',
    fg: '#c3d0e0',
    fgMuted: '#6e8199',
    border: '#1d3a5c',
    accent: '#22d3ee',
    accentFg: '#09131f',
    selection: '#1f4568',
    lineHl: '#16273d',
    error: '#ff6b7f',
    warning: '#ffb86c',
    info: '#22d3ee',
    success: '#50fa7b',
    syntax: {
      keyword: '#22d3ee',
      control: '#38bdf8',
      string: '#7ee787',
      number: '#ffb86c',
      comment: '#546a85',
      function: '#79c0ff',
      type: '#5eead4',
      variable: '#c3d0e0',
      parameter: '#ffb86c',
      property: '#a5d6ff',
      constant: '#ff9e64',
      tag: '#ff6b7f',
      attribute: '#7ee787',
      operator: '#22d3ee',
      regexp: '#a5f3fc'
    },
    ansi: [
      '#16273d', '#ff6b7f', '#7ee787', '#ffb86c', '#79c0ff', '#c792ea', '#22d3ee', '#c3d0e0',
      '#2f4a6b', '#ff9aa8', '#a3f7ab', '#ffd29e', '#a5d6ff', '#e0b7ff', '#67e8f9', '#eef5ff'
    ]
  },
  {
    id: 'high-contrast-dark',
    name: 'High Contrast Dark',
    type: 'high-contrast-dark',
    description: 'Maximum contrast on black with explicit borders on every surface.',
    bg: '#000000',
    bgAlt: '#000000',
    bgDeep: '#000000',
    bgRaised: '#0a0a0a',
    fg: '#ffffff',
    fgMuted: '#c0c0c0',
    border: '#6fc3df',
    accent: '#1aebff',
    accentFg: '#000000',
    selection: '#004b6b',
    lineHl: '#0f0f0f',
    error: '#ff4b4b',
    warning: '#ffd400',
    info: '#1aebff',
    success: '#3ff23f',
    syntax: {
      keyword: '#1aebff',
      control: '#69c0ff',
      string: '#3ff23f',
      number: '#ffd400',
      comment: '#9c9c9c',
      function: '#ffff00',
      type: '#5ffbff',
      variable: '#ffffff',
      parameter: '#ffd400',
      property: '#9cdcfe',
      constant: '#ffd400',
      tag: '#ff8fff',
      attribute: '#9cdcfe',
      operator: '#ffffff',
      regexp: '#3ff23f'
    },
    ansi: [
      '#000000', '#ff4b4b', '#3ff23f', '#ffd400', '#1aebff', '#ff8fff', '#5ffbff', '#ffffff',
      '#6b6b6b', '#ff7b7b', '#7bff7b', '#ffe866', '#66f2ff', '#ffb3ff', '#9dfdff', '#ffffff'
    ]
  },
  {
    id: 'high-contrast-light',
    name: 'High Contrast Light',
    type: 'high-contrast-light',
    description: 'Maximum contrast on white, meeting WCAG AAA for body text.',
    bg: '#ffffff',
    bgAlt: '#ffffff',
    bgDeep: '#ffffff',
    bgRaised: '#f2f2f2',
    fg: '#000000',
    fgMuted: '#3d3d3d',
    border: '#0f4a85',
    accent: '#0f4a85',
    accentFg: '#ffffff',
    selection: '#a8d1ff',
    lineHl: '#f0f0f0',
    error: '#b5121b',
    warning: '#7a5000',
    info: '#0f4a85',
    success: '#0a6b28',
    syntax: {
      keyword: '#0f4a85',
      control: '#7a1fa2',
      string: '#0a6b28',
      number: '#7a5000',
      comment: '#4a4a4a',
      function: '#6a1b9a',
      type: '#00666e',
      variable: '#000000',
      parameter: '#7a5000',
      property: '#0f4a85',
      constant: '#7a5000',
      tag: '#b5121b',
      attribute: '#0f4a85',
      operator: '#000000',
      regexp: '#0a6b28'
    },
    ansi: [
      '#000000', '#b5121b', '#0a6b28', '#7a5000', '#0f4a85', '#7a1fa2', '#00666e', '#e6e6e6',
      '#3d3d3d', '#d31c26', '#0d8a33', '#9c6600', '#1560a8', '#9427c4', '#00838c', '#ffffff'
    ]
  }
];

/** Appends an eight-digit alpha suffix to a six-digit hex colour. */
function alpha(hex, fraction) {
  const value = Math.round(Math.min(Math.max(fraction, 0), 1) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${value}`;
}

/** Derives the complete workbench colour map from a palette. */
function buildColors(p) {
  const isHighContrast = p.type.startsWith('high-contrast');
  const contrastBorder = isHighContrast ? p.border : undefined;

  const colors = {
    'editor.background': p.bg,
    'editor.foreground': p.fg,
    'editor.lineHighlightBackground': p.lineHl,
    'editor.lineHighlightBorder': isHighContrast ? p.border : alpha(p.border, 0.5),
    'editor.selectionBackground': p.selection,
    'editor.selectionHighlightBackground': alpha(p.selection, 0.5),
    'editor.inactiveSelectionBackground': alpha(p.selection, 0.45),
    'editor.wordHighlightBackground': alpha(p.accent, 0.18),
    'editor.wordHighlightStrongBackground': alpha(p.accent, 0.28),
    'editor.findMatchBackground': alpha(p.warning, 0.45),
    'editor.findMatchHighlightBackground': alpha(p.warning, 0.25),
    'editor.rangeHighlightBackground': alpha(p.accent, 0.12),
    'editorCursor.foreground': p.accent,
    'editorLineNumber.foreground': p.fgMuted,
    'editorLineNumber.activeForeground': p.fg,
    'editorIndentGuide.background': alpha(p.border, 0.8),
    'editorIndentGuide.activeBackground': p.fgMuted,
    'editorWhitespace.foreground': alpha(p.fgMuted, 0.4),
    'editorRuler.foreground': p.border,
    'editorBracketMatch.background': alpha(p.accent, 0.2),
    'editorBracketMatch.border': p.accent,
    'editorError.foreground': p.error,
    'editorWarning.foreground': p.warning,
    'editorInfo.foreground': p.info,
    'editorHint.foreground': p.fgMuted,
    'editorGutter.addedBackground': p.success,
    'editorGutter.modifiedBackground': p.info,
    'editorGutter.deletedBackground': p.error,
    'editorOverviewRuler.errorForeground': p.error,
    'editorOverviewRuler.warningForeground': p.warning,
    'editorOverviewRuler.infoForeground': p.info,
    'editorOverviewRuler.border': p.border,

    'editorWidget.background': p.bgRaised,
    'editorWidget.foreground': p.fg,
    'editorWidget.border': p.border,
    'editorSuggestWidget.background': p.bgRaised,
    'editorSuggestWidget.border': p.border,
    'editorSuggestWidget.foreground': p.fg,
    'editorSuggestWidget.selectedBackground': alpha(p.accent, 0.25),
    'editorSuggestWidget.highlightForeground': p.accent,
    'editorHoverWidget.background': p.bgRaised,
    'editorHoverWidget.border': p.border,

    'activityBar.background': p.bgDeep,
    'activityBar.foreground': p.fg,
    'activityBar.inactiveForeground': p.fgMuted,
    'activityBar.border': p.border,
    'activityBar.activeBorder': p.accent,
    'activityBar.activeBackground': alpha(p.accent, 0.1),
    'activityBarBadge.background': p.accent,
    'activityBarBadge.foreground': p.accentFg,

    'sideBar.background': p.bgAlt,
    'sideBar.foreground': p.fg,
    'sideBar.border': p.border,
    'sideBarTitle.foreground': p.fgMuted,
    'sideBarSectionHeader.background': p.bgRaised,
    'sideBarSectionHeader.foreground': p.fg,
    'sideBarSectionHeader.border': p.border,

    'statusBar.background': p.accent,
    'statusBar.foreground': p.accentFg,
    'statusBar.border': p.border,
    'statusBar.noFolderBackground': p.bgRaised,
    'statusBar.noFolderForeground': p.fg,
    'statusBar.debuggingBackground': p.warning,
    'statusBar.debuggingForeground': p.bgDeep,
    'statusBarItem.hoverBackground': alpha(p.accentFg, 0.15),
    'statusBarItem.errorBackground': p.error,
    'statusBarItem.errorForeground': '#ffffff',
    'statusBarItem.warningBackground': p.warning,
    'statusBarItem.warningForeground': p.bgDeep,

    'titleBar.activeBackground': p.bgDeep,
    'titleBar.activeForeground': p.fg,
    'titleBar.inactiveBackground': p.bgDeep,
    'titleBar.inactiveForeground': p.fgMuted,
    'titleBar.border': p.border,

    'tab.activeBackground': p.bg,
    'tab.activeForeground': p.fg,
    'tab.activeBorderTop': p.accent,
    'tab.inactiveBackground': p.bgAlt,
    'tab.inactiveForeground': p.fgMuted,
    'tab.border': p.border,
    'tab.hoverBackground': p.bgRaised,
    'tab.unfocusedActiveBackground': p.bgAlt,
    'tab.modifiedBorder': p.warning,
    'editorGroupHeader.tabsBackground': p.bgAlt,
    'editorGroupHeader.border': p.border,

    'panel.background': p.bgAlt,
    'panel.border': p.border,
    'panelTitle.activeForeground': p.fg,
    'panelTitle.inactiveForeground': p.fgMuted,
    'panelTitle.activeBorder': p.accent,

    'terminal.background': p.bgAlt,
    'terminal.foreground': p.fg,
    'terminal.selectionBackground': p.selection,
    'terminalCursor.foreground': p.accent,
    'terminal.border': p.border,

    'input.background': p.bgRaised,
    'input.foreground': p.fg,
    'input.border': p.border,
    'input.placeholderForeground': p.fgMuted,
    'inputOption.activeBorder': p.accent,
    'inputValidation.errorBackground': alpha(p.error, 0.2),
    'inputValidation.errorBorder': p.error,

    'dropdown.background': p.bgRaised,
    'dropdown.foreground': p.fg,
    'dropdown.border': p.border,

    'button.background': p.accent,
    'button.foreground': p.accentFg,
    'button.hoverBackground': alpha(p.accent, 0.85),
    'button.secondaryBackground': p.bgRaised,
    'button.secondaryForeground': p.fg,

    'badge.background': p.accent,
    'badge.foreground': p.accentFg,

    'list.activeSelectionBackground': alpha(p.accent, 0.3),
    'list.activeSelectionForeground': p.fg,
    'list.inactiveSelectionBackground': alpha(p.accent, 0.15),
    'list.inactiveSelectionForeground': p.fg,
    'list.hoverBackground': alpha(p.fgMuted, 0.15),
    'list.hoverForeground': p.fg,
    'list.focusOutline': p.accent,
    'list.errorForeground': p.error,
    'list.warningForeground': p.warning,

    'scrollbarSlider.background': alpha(p.fgMuted, 0.4),
    'scrollbarSlider.hoverBackground': alpha(p.fgMuted, 0.6),
    'scrollbarSlider.activeBackground': alpha(p.fgMuted, 0.8),

    'notifications.background': p.bgRaised,
    'notifications.foreground': p.fg,
    'notifications.border': p.border,
    'notificationsErrorIcon.foreground': p.error,
    'notificationsWarningIcon.foreground': p.warning,
    'notificationsInfoIcon.foreground': p.info,

    'breadcrumb.background': p.bg,
    'breadcrumb.foreground': p.fgMuted,
    'breadcrumb.focusForeground': p.fg,

    'minimap.background': p.bg,
    'minimapSlider.background': alpha(p.fgMuted, 0.2),

    'focusBorder': p.accent,
    'foreground': p.fg,
    'descriptionForeground': p.fgMuted,
    'errorForeground': p.error,
    'widget.shadow': alpha('#000000', 0.36),
    'contrastBorder': contrastBorder ?? alpha(p.border, 0),
    'selection.background': p.selection,

    'gitDecoration.modifiedResourceForeground': p.warning,
    'gitDecoration.addedResourceForeground': p.success,
    'gitDecoration.deletedResourceForeground': p.error,
    'gitDecoration.untrackedResourceForeground': p.success,
    'gitDecoration.conflictingResourceForeground': p.error,
    'gitDecoration.ignoredResourceForeground': p.fgMuted,

    'problemsErrorIcon.foreground': p.error,
    'problemsWarningIcon.foreground': p.warning,
    'problemsInfoIcon.foreground': p.info
  };

  const ansiNames = [
    'Black', 'Red', 'Green', 'Yellow', 'Blue', 'Magenta', 'Cyan', 'White',
    'BrightBlack', 'BrightRed', 'BrightGreen', 'BrightYellow', 'BrightBlue', 'BrightMagenta',
    'BrightCyan', 'BrightWhite'
  ];
  ansiNames.forEach((name, index) => {
    colors[`terminal.ansi${name}`] = p.ansi[index];
  });

  return colors;
}

/** Derives TextMate token rules from the palette's syntax colours. */
function buildTokenColors(p) {
  const s = p.syntax;
  return [
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: s.comment, fontStyle: 'italic' } },
    { scope: ['keyword', 'storage.type', 'storage.modifier'], settings: { foreground: s.keyword } },
    { scope: ['keyword.control', 'keyword.operator.new', 'keyword.control.flow'], settings: { foreground: s.control } },
    { scope: ['keyword.operator'], settings: { foreground: s.operator } },
    { scope: ['string', 'string.quoted', 'punctuation.definition.string'], settings: { foreground: s.string } },
    { scope: ['string.template', 'string.interpolated'], settings: { foreground: s.string } },
    { scope: ['string.regexp', 'constant.character.escape'], settings: { foreground: s.regexp } },
    { scope: ['constant.numeric', 'constant.numeric.integer', 'constant.numeric.float'], settings: { foreground: s.number } },
    { scope: ['constant.language', 'constant.language.boolean', 'constant.language.null'], settings: { foreground: s.constant } },
    { scope: ['constant.other', 'variable.other.constant'], settings: { foreground: s.constant } },
    { scope: ['variable', 'variable.other', 'meta.definition.variable.name'], settings: { foreground: s.variable } },
    { scope: ['variable.parameter', 'meta.function.parameter'], settings: { foreground: s.parameter } },
    { scope: ['variable.other.property', 'meta.object-literal.key', 'support.type.property-name'], settings: { foreground: s.property } },
    { scope: ['entity.name.function', 'support.function', 'meta.function-call'], settings: { foreground: s.function } },
    { scope: ['entity.name.type', 'entity.name.class', 'support.type', 'support.class'], settings: { foreground: s.type } },
    { scope: ['entity.name.namespace', 'entity.name.module'], settings: { foreground: s.type } },
    { scope: ['entity.name.tag'], settings: { foreground: s.tag } },
    { scope: ['entity.other.attribute-name'], settings: { foreground: s.attribute } },
    { scope: ['entity.name.tag.css', 'entity.other.attribute-name.class.css'], settings: { foreground: s.type } },
    { scope: ['markup.heading'], settings: { foreground: s.function, fontStyle: 'bold' } },
    { scope: ['markup.bold'], settings: { fontStyle: 'bold' } },
    { scope: ['markup.italic'], settings: { fontStyle: 'italic' } },
    { scope: ['markup.inline.raw', 'markup.fenced_code'], settings: { foreground: s.string } },
    { scope: ['markup.underline.link'], settings: { foreground: s.property, fontStyle: 'underline' } },
    { scope: ['punctuation', 'punctuation.separator', 'meta.brace'], settings: { foreground: p.fgMuted } },
    { scope: ['invalid', 'invalid.illegal'], settings: { foreground: p.error } },
    { scope: ['invalid.deprecated'], settings: { foreground: p.warning, fontStyle: 'italic' } },
    { scope: ['markup.inserted', 'meta.diff.header.to-file'], settings: { foreground: p.success } },
    { scope: ['markup.deleted', 'meta.diff.header.from-file'], settings: { foreground: p.error } },
    { scope: ['markup.changed'], settings: { foreground: p.warning } }
  ];
}

function buildSemanticTokenColors(p) {
  const s = p.syntax;
  return {
    namespace: s.type,
    type: s.type,
    class: s.type,
    enum: s.type,
    interface: s.type,
    struct: s.type,
    typeParameter: s.type,
    parameter: s.parameter,
    variable: s.variable,
    property: s.property,
    enumMember: s.constant,
    decorator: s.function,
    event: s.function,
    function: s.function,
    method: s.function,
    macro: s.function,
    label: s.control,
    comment: s.comment,
    string: s.string,
    keyword: s.keyword,
    number: s.number,
    regexp: s.regexp,
    operator: s.operator
  };
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const ids = [];

  for (const palette of PALETTES) {
    const theme = {
      $schema: 'https://causeway.dev/schemas/theme.schema.json',
      id: palette.id,
      name: palette.name,
      type: palette.type,
      description: palette.description,
      author: 'causeway Team',
      license: 'MIT',
      semanticHighlighting: true,
      colors: buildColors(palette),
      tokenColors: buildTokenColors(palette),
      semanticTokenColors: buildSemanticTokenColors(palette)
    };

    const file = join(outDir, `${palette.id}.json`);
    await writeFile(file, `${JSON.stringify(theme, null, 2)}\n`, 'utf8');
    ids.push(palette.id);
    process.stdout.write(`Generated ${palette.id}.json\n`);
  }

  process.stdout.write(`\n${ids.length} themes written to ${outDir}\n`);
}

main().catch((error) => {
  process.stderr.write(`Theme generation failed: ${String(error)}\n`);
  process.exitCode = 1;
});
