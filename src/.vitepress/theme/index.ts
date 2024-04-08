import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import GitalkLayout from './layout/GitalkLayout.vue'

import 'gitalk/dist/gitalk.css'

const theme: Theme = {
  ...DefaultTheme,
  Layout: GitalkLayout
}

export default theme