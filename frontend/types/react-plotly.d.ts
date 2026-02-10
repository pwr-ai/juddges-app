/* eslint-disable @typescript-eslint/no-explicit-any */
declare module 'react-plotly.js' {
  import * as React from 'react';

  interface PlotParams {
    data?: any[];
    layout?: any;
    config?: any;
    frames?: any[];
    onClick?: (event: any) => void;
    onHover?: (event: any) => void;
    onUnhover?: (event: any) => void;
    onSelected?: (event: any) => void;
    onDeselect?: (event: any) => void;
    onRestyle?: (data: any) => void;
    onRelayout?: (layout: any) => void;
    onUpdate?: (figure: any) => void;
    onInitialized?: (figure: any) => void;
    onPurge?: () => void;
    onError?: (err: any) => void;
    divId?: string;
    revision?: number;
    className?: string;
    style?: React.CSSProperties;
    useResizeHandler?: boolean;
    debug?: boolean;
  }
  
  const Plot: React.FC<PlotParams>;
  export default Plot;
} 