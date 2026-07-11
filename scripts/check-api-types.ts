// fails tsc when pinax-api.d.ts drifts from the real src/core types
import type { PinaxApi as SrcApi } from "../src/core/api";
import type { WidgetSpec as SrcWidgetSpec, WidgetContext as SrcWidgetContext, PaneConfig as SrcPaneConfig } from "../src/core/types";
import type { PinaxApi as DeclApi, WidgetSpec as DeclWidgetSpec, WidgetContext as DeclWidgetContext, PaneConfig as DeclPaneConfig } from "../pinax-api";

declare const srcApi: SrcApi;
declare const declApi: DeclApi;
const apiForward: DeclApi = srcApi;
const apiBackward: SrcApi = declApi;

declare const srcSpec: SrcWidgetSpec;
declare const declSpec: DeclWidgetSpec;
const specForward: DeclWidgetSpec = srcSpec;
const specBackward: SrcWidgetSpec = declSpec;

declare const srcCtx: SrcWidgetContext;
declare const declCtx: DeclWidgetContext;
const ctxForward: DeclWidgetContext = srcCtx;
const ctxBackward: SrcWidgetContext = declCtx;

declare const srcPane: SrcPaneConfig;
declare const declPane: DeclPaneConfig;
const paneForward: DeclPaneConfig = srcPane;
const paneBackward: SrcPaneConfig = declPane;

void [apiForward, apiBackward, specForward, specBackward, ctxForward, ctxBackward, paneForward, paneBackward];
