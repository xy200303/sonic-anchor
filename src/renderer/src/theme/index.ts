import { darkTheme, type GlobalThemeOverrides } from 'naive-ui'

export { darkTheme }

const t = {
  base: '#141311',
  surface: '#1C1B18',
  elevated: '#24221D',
  border: '#34312A',
  text1: '#EDEAE2',
  text2: '#A8A29A',
  text3: '#6E6A61',
  brand: '#C4703F',
  brandHover: '#D0824F',
  brandPressed: '#A85D31',
  danger: '#E03131',
  warning: '#D9A441',
  success: '#6FA287'
}

export const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: t.brand,
    primaryColorHover: t.brandHover,
    primaryColorPressed: t.brandPressed,
    primaryColorSuppl: t.brand,
    errorColor: t.danger,
    warningColor: t.warning,
    successColor: t.success,
    bodyColor: t.base,
    cardColor: t.surface,
    modalColor: t.elevated,
    popoverColor: t.elevated,
    tableColor: t.surface,
    borderColor: t.border,
    dividerColor: t.border,
    textColorBase: t.text1,
    textColor1: t.text1,
    textColor2: t.text2,
    textColor3: t.text3,
    borderRadius: '6px',
    borderRadiusSmall: '4px',
    fontSize: '14px'
  },
  Card: {
    color: t.surface,
    borderColor: t.border,
    titleTextColor: t.text1
  },
  Layout: {
    siderColor: t.base,
    color: t.base
  },
  Menu: {
    color: t.base,
    itemColor: 'transparent',
    itemColorHover: t.elevated,
    itemColorActive: t.elevated,
    itemColorActiveHover: t.elevated,
    itemColorCollapsedHover: t.elevated,
    itemTextColor: t.text2,
    itemTextColorHover: t.text1,
    itemTextColorActive: t.text1,
    itemTextColorActiveHover: t.text1,
    itemTextColorChildActive: t.brand,
    itemTextColorChildActiveHover: t.brandHover,
    itemIconColor: t.text3,
    itemIconColorHover: t.text2,
    itemIconColorActive: t.brand,
    itemIconColorActiveHover: t.brandHover,
    itemIconColorChildActive: t.brand,
    arrowColor: t.text3,
    arrowColorHover: t.text2,
    arrowColorActive: t.text2,
    groupTextColor: t.text3
  },
  Input: {
    color: t.elevated,
    colorFocus: t.elevated,
    textColor: t.text1,
    placeholderColor: t.text3,
    border: `1px solid ${t.border}`,
    borderHover: `1px solid ${t.border}`,
    borderFocus: `1px solid ${t.brand}`,
    borderError: `1px solid ${t.danger}`,
    boxShadowFocus: '0 0 0 2px rgba(196, 112, 63, 0.25)'
  },
  Select: {
    peers: {
      InternalSelection: {
        color: t.elevated,
        textColor: t.text1,
        border: `1px solid ${t.border}`,
        borderActive: `1px solid ${t.brand}`,
        boxShadowActive: '0 0 0 2px rgba(196, 112, 63, 0.25)'
      }
    }
  },
  Tabs: {
    tabTextColorLine: t.text2,
    tabTextColorActiveLine: t.brand,
    barColor: t.brand
  },
  DataTable: {
    thColor: t.surface,
    tdColor: t.surface,
    borderColor: t.border
  }
}
