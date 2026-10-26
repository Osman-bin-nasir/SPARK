import { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  render() {
    if (this.state.failed) {
      return (
        <main className="app" style={{ padding: '32px', maxWidth: '640px', margin: 'auto' }}>
          <h1>SPARK could not display this page</h1>
          <p>Your saved data is still available. Reload the page to try again.</p>
          <button type="button" onClick={() => window.location.reload()}>Reload page</button>
        </main>
      );
    }
    return this.props.children;
  }
}
