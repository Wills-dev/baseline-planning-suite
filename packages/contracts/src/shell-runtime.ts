/** Shell-owned presentation context; no authentication or exchange-rate semantics. */
export type DisplayCurrency = 'EUR' | 'USD' | 'GBP';

export interface ShellRuntimeContext {
  readonly displayCurrency: DisplayCurrency;
  readonly activeUser: { readonly id: string; readonly name: string };
}

/** Required by public page exposures; standalone composition roots supply local defaults. */
export interface ShellRuntimeProps {
  readonly runtimeContext: ShellRuntimeContext;
}
