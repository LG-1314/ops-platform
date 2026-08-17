import { createTheme, type Theme, type ThemeOptions } from '@mui/material/styles'
import tokens from './design-tokens.json'

type Mode = 'dark' | 'light'

const paletteFor = (mode: Mode) => tokens.color[mode]
const shadowFor = (mode: Mode) => tokens.shadow[mode]

/**
 * 构建 Ops Cockpit MUI 主题（消费 design-tokens.json）。
 * Token 与 design-tokens.css / docs/UIUX.md / docs/Spec.md §8 完全一致。
 *
 * 用法：
 *   import { buildTheme } from './theme/theme'
 *   const theme = buildTheme('dark')   // 或 'light'，跟随 nativeTheme
 *
 * 数值/指标单元格请使用 --font-mono + font-variant-numeric: tabular-nums + 右对齐
 * （见 docs/components-spec.md），其余 UI 文本使用默认 Inter 字体族。
 */
export function buildTheme(mode: Mode = 'dark'): Theme {
  const c = paletteFor(mode)
  const sh = shadowFor(mode)

  const hoverBg =
    mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(15, 23, 42, 0.04)'
  const chipBg =
    mode === 'dark' ? 'rgba(124, 156, 255, 0.12)' : 'rgba(30, 58, 138, 0.08)'

  const options: ThemeOptions = {
    palette: {
      mode,
      primary: { main: c.primary, light: c.primaryHover, dark: c.primaryActive },
      success: { main: c.success },
      warning: { main: c.warning },
      error: { main: c.danger },
      info: { main: c.info },
      background: { default: c.bg, paper: c.panel },
      text: { primary: c.text, secondary: c.textSecondary, disabled: c.textDisabled },
      divider: c.border,
      action: { hover: hoverBg },
    },
    shape: { borderRadius: 8 },
    typography: {
      fontFamily: tokens.fontFamily.ui,
      fontSize: 14,
      htmlFontSize: 16,
      h5: { fontSize: 20, fontWeight: 600 },
      h6: { fontSize: 18, fontWeight: 600 },
      subtitle1: { fontSize: 16, fontWeight: 600 },
      subtitle2: { fontSize: 14, fontWeight: 600 },
      body1: { fontSize: 14, lineHeight: 1.6 },
      body2: { fontSize: 13, lineHeight: 1.5 },
      caption: { fontSize: 12, lineHeight: 1.4 },
      button: { textTransform: 'none', fontWeight: 600 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: c.bg,
            color: c.text,
            fontFamily: tokens.fontFamily.ui,
          },
          '*::-webkit-scrollbar': {
            width: 8,
            height: 8,
          },
          '*::-webkit-scrollbar-track': {
            background: mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(15,23,42,0.04)',
            borderRadius: 4,
          },
          '*::-webkit-scrollbar-thumb': {
            background: mode === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(15,23,42,0.25)',
            borderRadius: 4,
            '&:hover': {
              background: mode === 'dark' ? 'rgba(255,255,255,0.25)' : 'rgba(15,23,42,0.35)',
            },
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: 8,
            fontWeight: 600,
            textTransform: 'none',
            transition: 'background 0.2s ease, box-shadow 0.2s ease, transform 0.1s ease',
            '&:active': { transform: 'scale(0.98)' },
          },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            backgroundColor: c.panel,
            backgroundImage: 'none',
            border: `1px solid ${c.border}`,
            borderRadius: 8,
          },
        },
      },
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            backgroundColor: c.panel,
            backgroundImage: 'none',
            border: `1px solid ${c.border}`,
            borderRadius: 8,
            transition: 'border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease',
            '&:hover': {
              borderColor:
                mode === 'dark' ? 'rgba(124,156,255,0.35)' : 'rgba(30,58,138,0.28)',
              boxShadow: sh.md,
            },
          },
        },
      },
      MuiAppBar: {
        defaultProps: { elevation: 0, color: 'default' },
        styleOverrides: {
          root: {
            backgroundColor: c.panel,
            backgroundImage: 'none',
            borderBottom: `1px solid ${c.border}`,
            color: c.text,
          },
        },
      },
      MuiInputBase: {
        styleOverrides: {
          root: {
            backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)',
            borderRadius: 8,
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)',
            borderRadius: 8,
          },
          notchedOutline: {
            borderColor: c.border,
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderColor: c.border,
            fontSize: 14,
            // 数值单元格：fontFamily var(--font-mono) + tabular-nums + 右对齐
          },
          head: {
            backgroundColor: c.panel2,
            color: c.textSecondary,
            fontWeight: 600,
          },
          body: {
            color: c.text,
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            '&:hover': { backgroundColor: hoverBg },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            fontWeight: 600,
            backgroundColor: chipBg,
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 2,
            transition: 'background 0.2s ease, color 0.2s ease',
          },
        },
      },
      MuiDivider: {
        styleOverrides: {
          root: {
            borderColor: c.border,
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: c.panel2,
            color: c.text,
            border: `1px solid ${c.border}`,
            boxShadow: sh.md,
            fontSize: 12,
          },
        },
      },
    },
  }

  return createTheme(options)
}

export default buildTheme
