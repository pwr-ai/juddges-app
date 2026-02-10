declare module 'react-plotly.js/factory' {
  import { PlotParams } from 'react-plotly.js';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export default function createPlotlyComponent(plotly: any): React.ComponentType<PlotParams>;
}
