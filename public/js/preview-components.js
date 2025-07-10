// Preview Components for the Preview Tab
const { useState, useEffect } = React;

// Sample Data Preview Component
const DataPreview = () => {
    const [sampleData, setSampleData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Load sample data
        fetch('/sample_data.json')
            .then(response => response.json())
            .then(data => {
                setSampleData(data);
                setLoading(false);
            })
            .catch(error => {
                console.error('Error loading sample data:', error);
                setLoading(false);
            });
    }, []);

    if (loading) {
        return React.createElement('div', {
            className: 'text-center py-4'
        }, [
            React.createElement('div', {
                className: 'spinner-border text-primary',
                role: 'status'
            }),
            React.createElement('div', {
                className: 'mt-2'
            }, 'Loading sample data...')
        ]);
    }

    if (!sampleData) {
        return React.createElement('div', {
            className: 'alert alert-warning'
        }, 'No sample data available');
    }

    return React.createElement('div', {
        className: 'preview-container'
    }, [
        React.createElement('h5', {
            className: 'mb-3'
        }, 'Data Preview'),
        React.createElement('div', {
            className: 'preview-item'
        }, [
            React.createElement('h6', null, 'Sample Discharge Data'),
            React.createElement('div', {
                className: 'preview-data'
            }, JSON.stringify(sampleData, null, 2))
        ])
    ]);
};

// Model Configuration Preview Component
const ModelConfigPreview = () => {
    const [config, setConfig] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Load model configuration
        fetch('/api/orchestrator/config')
            .then(response => response.json())
            .then(data => {
                setConfig(data);
                setLoading(false);
            })
            .catch(error => {
                console.error('Error loading config:', error);
                setLoading(false);
            });
    }, []);

    if (loading) {
        return React.createElement('div', {
            className: 'text-center py-4'
        }, [
            React.createElement('div', {
                className: 'spinner-border text-primary',
                role: 'status'
            }),
            React.createElement('div', {
                className: 'mt-2'
            }, 'Loading configuration...')
        ]);
    }

    if (!config) {
        return React.createElement('div', {
            className: 'alert alert-warning'
        }, 'No configuration available');
    }

    return React.createElement('div', {
        className: 'preview-container'
    }, [
        React.createElement('h5', {
            className: 'mb-3'
        }, 'Model Configuration'),
        React.createElement('div', {
            className: 'preview-item'
        }, [
            React.createElement('h6', null, 'Available Models'),
            React.createElement('div', {
                className: 'row'
            }, config.models && config.models.map((model, index) => 
                React.createElement('div', {
                    key: index,
                    className: 'col-md-6 col-lg-4 mb-3'
                }, 
                    React.createElement('div', {
                        className: `card h-100 ${model.enabled ? 'border-success' : 'border-secondary'}`
                    }, [
                        React.createElement('div', {
                            className: 'card-body'
                        }, [
                            React.createElement('h6', {
                                className: 'card-title'
                            }, model.displayName || model.name),
                            React.createElement('p', {
                                className: 'card-text small'
                            }, [
                                React.createElement('strong', null, 'URL: '),
                                React.createElement('code', null, model.url)
                            ]),
                            React.createElement('p', {
                                className: 'card-text small'
                            }, [
                                React.createElement('strong', null, 'Type: '),
                                model.type || 'Unknown'
                            ]),
                            React.createElement('div', {
                                className: 'mt-2'
                            }, 
                                React.createElement('span', {
                                    className: `badge ${model.enabled ? 'bg-success' : 'bg-secondary'}`
                                }, model.enabled ? 'Enabled' : 'Disabled')
                            )
                        ])
                    ])
                )
            ))
        ]),
        React.createElement('div', {
            className: 'preview-item'
        }, [
            React.createElement('h6', null, 'Full Configuration'),
            React.createElement('div', {
                className: 'preview-data'
            }, JSON.stringify(config, null, 2))
        ])
    ]);
};

// API Endpoints Preview Component
const ApiEndpointsPreview = () => {
    const endpoints = [
        {
            method: 'GET',
            path: '/api/orchestrator/config',
            description: 'Get orchestrator configuration'
        },
        {
            method: 'GET',
            path: '/api/orchestrator/status',
            description: 'Get models status'
        },
        {
            method: 'POST',
            path: '/api/orchestrator/predict',
            description: 'Run prediction on uploaded files'
        },
        {
            method: 'POST',
            path: '/api/orchestrator/train',
            description: 'Train models with uploaded data'
        },
        {
            method: 'POST',
            path: '/api/orchestrator/train-raw',
            description: 'Train models with raw discharge data'
        }
    ];

    return React.createElement('div', {
        className: 'preview-container'
    }, [
        React.createElement('h5', {
            className: 'mb-3'
        }, 'API Endpoints'),
        React.createElement('div', {
            className: 'preview-item'
        }, [
            React.createElement('h6', null, 'Available Endpoints'),
            React.createElement('div', {
                className: 'table-responsive'
            }, 
                React.createElement('table', {
                    className: 'table table-sm'
                }, [
                    React.createElement('thead', null,
                        React.createElement('tr', null, [
                            React.createElement('th', null, 'Method'),
                            React.createElement('th', null, 'Path'),
                            React.createElement('th', null, 'Description')
                        ])
                    ),
                    React.createElement('tbody', null,
                        endpoints.map((endpoint, index) =>
                            React.createElement('tr', {
                                key: index
                            }, [
                                React.createElement('td', null,
                                    React.createElement('span', {
                                        className: `badge ${endpoint.method === 'GET' ? 'bg-primary' : 'bg-success'}`
                                    }, endpoint.method)
                                ),
                                React.createElement('td', null,
                                    React.createElement('code', null, endpoint.path)
                                ),
                                React.createElement('td', null, endpoint.description)
                            ])
                        )
                    )
                ])
            )
        ])
    ]);
};

// Main Preview Component
const PreviewTab = () => {
    const [activePreview, setActivePreview] = useState('data');

    return React.createElement('div', {
        className: 'preview-tab'
    }, [
        React.createElement('div', {
            className: 'mb-3'
        }, [
            React.createElement('ul', {
                className: 'nav nav-pills'
            }, [
                React.createElement('li', {
                    className: 'nav-item'
                }, 
                    React.createElement('button', {
                        className: `nav-link ${activePreview === 'data' ? 'active' : ''}`,
                        onClick: () => setActivePreview('data')
                    }, 'Sample Data')
                ),
                React.createElement('li', {
                    className: 'nav-item'
                }, 
                    React.createElement('button', {
                        className: `nav-link ${activePreview === 'config' ? 'active' : ''}`,
                        onClick: () => setActivePreview('config')
                    }, 'Model Config')
                ),
                React.createElement('li', {
                    className: 'nav-item'
                }, 
                    React.createElement('button', {
                        className: `nav-link ${activePreview === 'api' ? 'active' : ''}`,
                        onClick: () => setActivePreview('api')
                    }, 'API Endpoints')
                )
            ])
        ]),
        React.createElement('div', {
            className: 'preview-content'
        }, [
            activePreview === 'data' && React.createElement(DataPreview),
            activePreview === 'config' && React.createElement(ModelConfigPreview),
            activePreview === 'api' && React.createElement(ApiEndpointsPreview)
        ])
    ]);
};

// Export the preview component
window.PreviewTab = PreviewTab;
