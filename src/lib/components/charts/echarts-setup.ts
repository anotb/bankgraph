/**
 * Tree-shaken ECharts setup.
 * Only imports the components we actually use, reducing bundle by ~60%.
 * All chart components should import `echarts` from here instead of 'echarts'.
 */

import * as echarts from 'echarts/core';
import { LineChart, BarChart } from 'echarts/charts';
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  DataZoomComponent,
  MarkAreaComponent
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  LineChart,
  BarChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  DataZoomComponent,
  MarkAreaComponent,
  CanvasRenderer
]);

export { echarts };
export type { EChartsType } from 'echarts/core';
