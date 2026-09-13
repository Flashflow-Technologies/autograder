import { Component } from 'react';
import { logClientError } from '../utils/logger.js';

/**
 * Catches render-time errors anywhere in the tree, logs them to the backend,
 * and shows a recoverable fallback instead of a blank white screen.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Something went wrong' };
  }

  componentDidCatch(error, info) {
    logClientError(`React render error: ${error?.message}`, {
      stack: error?.stack,
      context: { componentStack: info?.componentStack, type: 'react-boundary' },
    });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
        <div className="card" style={{ padding: 28, maxWidth: 440, textAlign: 'center' }}>
          <h2 style={{ marginBottom: 8 }}>Something went wrong</h2>
          <p className="muted" style={{ marginBottom: 18 }}>{this.state.message}</p>
          <button className="primary" onClick={() => { this.setState({ hasError: false }); window.location.href = '/'; }}>
            Return to start
          </button>
        </div>
      </div>
    );
  }
}
