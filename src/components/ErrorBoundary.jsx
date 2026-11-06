import { Component } from "react";

import "./ErrorBoundary.css";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false, error: null
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true, error
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Errore React intercettato:", error);
    console.error("Informazioni sul componente:", errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReturnHome = () => {
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      return (
        <main className="error-boundary-page">
          <section className="error-boundary-card">
            <p className="error-boundary-label">
              Nation&apos;s Conquest
            </p>
            <h1>
              Si è verificato un errore
            </h1>
            <p>
              La pagina della partita non è stata caricata correttamente.
            </p>
            <pre className="error-boundary-message">
              {this.state.error?.message ?? "Errore sconosciuto"}
            </pre>
            <div className="error-boundary-actions">
              <button type="button" onClick={this.handleReload}>
                Ricarica la pagina
              </button>
              <button type="button" className="secondary" onClick={this.handleReturnHome}>
                Torna al menu
              </button>
            </div>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;