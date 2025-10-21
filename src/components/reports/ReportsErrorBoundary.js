import React from 'react';

export default class ReportsErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Reports page error:', error, info);
    if (this.props.onError) this.props.onError(error);
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return React.createElement(
        'div',
        { className: 'p-6 text-center space-y-4' },
        React.createElement('p', { className: 'text-lg' }, 'אירעה שגיאה לא צפויה בדוחות.'),
        React.createElement(
          'button',
          { onClick: this.handleReset, className: 'px-4 py-2 bg-blue-600 text-white rounded-md' },
          'רענן'
        )
      );
    }
    return this.props.children;
  }
}
