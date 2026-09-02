import { RadarChart } from 'echarts/charts';
import { RadarComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([RadarChart, RadarComponent, TooltipComponent, CanvasRenderer]);

export { echarts };
