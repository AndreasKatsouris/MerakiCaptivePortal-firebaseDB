// Sparks Hi-Fi Vue 3 component library — Phase D2.
// Import individual components, or the whole kit via the default export.
//
// Usage:
//   import { HfButton, HfCard } from '/js/design-system/hifi/index.js'
//   -- or --
//   import HiFi from '/js/design-system/hifi/index.js'
//   app.use(HiFi)  // registers all components globally as <HfButton/>, etc.

import HfButton  from './components/HfButton.vue'
import HfChip    from './components/HfChip.vue'
import HfCard    from './components/HfCard.vue'
import HfInput   from './components/HfInput.vue'
import HfIcon    from './components/HfIcon.vue'
import HfAvatar  from './components/HfAvatar.vue'
import HfLogo    from './components/HfLogo.vue'
import HfNavItem from './components/HfNavItem.vue'
import HfKbd     from './components/HfKbd.vue'

import HfLineChart      from './charts/HfLineChart.vue'
import HfBarChart       from './charts/HfBarChart.vue'
import HfDonut          from './charts/HfDonut.vue'
import HfSparkline      from './charts/HfSparkline.vue'
import HfCompareChart   from './charts/HfCompareChart.vue'
import HfChartTooltip   from './charts/HfChartTooltip.vue'
import HfPieChart       from './charts/HfPieChart.vue'
import HfMultiLineChart from './charts/HfMultiLineChart.vue'

const components = {
  HfButton, HfChip, HfCard, HfInput, HfIcon, HfAvatar, HfLogo, HfNavItem, HfKbd,
  HfLineChart, HfBarChart, HfDonut, HfSparkline, HfCompareChart, HfChartTooltip,
  HfPieChart, HfMultiLineChart,
}

export {
  HfButton, HfChip, HfCard, HfInput, HfIcon, HfAvatar, HfLogo, HfNavItem, HfKbd,
  HfLineChart, HfBarChart, HfDonut, HfSparkline, HfCompareChart, HfChartTooltip,
  HfPieChart, HfMultiLineChart,
}

export default {
  install(app) {
    for (const [name, comp] of Object.entries(components)) app.component(name, comp)
  },
}
