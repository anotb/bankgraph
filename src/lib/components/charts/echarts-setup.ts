/**
 * Tree-shaken ECharts setup.
 * Only imports the components we actually use, reducing bundle by ~60%.
 * All chart components should import `echarts` from here instead of 'echarts'.
 */

import * as echarts from 'echarts/core';
import { LineChart, BarChart, PieChart, RadarChart as ERadarChart } from 'echarts/charts';
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  DataZoomComponent,
  MarkAreaComponent,
  RadarComponent
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  LineChart,
  BarChart,
  PieChart,
  ERadarChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  DataZoomComponent,
  MarkAreaComponent,
  RadarComponent,
  CanvasRenderer
]);

export { echarts };
export type { EChartsType } from 'echarts/core';
