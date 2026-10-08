import { Component, type ReactNode } from 'react';

interface Props {
  name: string;
  onRetry: () => void;
  children: ReactNode;
}

/** Only the remote area is replaced; Shell navigation remains outside this boundary. */
export class RemoteErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render() {
    if (this.state.failed)
      return (
        <section role="alert" aria-label={`${this.props.name} unavailable`}>
          <h2>{this.props.name} is unavailable</h2>
          <p>
            The {this.props.name} application could not be loaded or displayed.
            Check the remote configuration or service and try again.
          </p>
          <button type="button" onClick={this.props.onRetry}>
            Retry {this.props.name}
          </button>
        </section>
      );
    return this.props.children;
  }
}
