// Modern React Flow Components for Dark Theme Flow Studio
const { useState, useCallback, useEffect, useRef, useMemo } = React;
const { ReactFlow, addEdge, applyEdgeChanges, applyNodeChanges, Background, Controls, MiniMap, Handle, Position } = window.ReactFlow;

// Create a global model status store that all nodes can share
window.modelStatusStore = window.modelStatusStore || {
    statuses: {},
    listeners: new Set(),
    
    // Update status and notify listeners
    updateStatus: function(modelStatus) {
        // Store the latest status
        this.statuses = modelStatus || {};
        
        // Notify all listeners
        this.listeners.forEach(listener => listener(this.statuses));
    },
    
    // Subscribe to status updates
    subscribe: function(listener) {
        this.listeners.add(listener);
        // Immediately call with current status
        listener(this.statuses);
        
        // Return unsubscribe function
        return () => {
            this.listeners.delete(listener);
        };
    },
    
    // Get status for specific model
    getModelStatus: function(modelName) {
        return this.statuses[modelName] || { status: 'unknown', lastCheck: null };
    }
};

if (window.socket && !window.modelStatusInitialized) {
    window.socket.on('health-update', (modelStatus) => {
        window.modelStatusStore.updateStatus(modelStatus);
    });

    console.log('[GLOBAL] Requesting initial health status');
    window.socket.emit('request-health');
    
    window.modelStatusInitialized = true;
}

const ModelNode = React.memo(({ data, selected }) => {
    const { modelName, enabled, status, modelType } = data;
    const [actualStatus, setActualStatus] = useState('disabled');
    const [isOnline, setIsOnline] = useState(false);
    
    // Subscribe to global status updates
    useEffect(() => {
        // Get current status immediately
        const currentStatus = window.modelStatusStore.getModelStatus(data.name);
        setActualStatus(currentStatus.status || 'unknown');
        setIsOnline(currentStatus.status === 'online');
        
        // Subscribe to future updates
        const unsubscribe = window.modelStatusStore.subscribe((statuses) => {
            const modelStatus = statuses[data.name];
            if (modelStatus) {
                setActualStatus(modelStatus.status);
                setIsOnline(modelStatus.status === 'online');
            } else {
                setActualStatus('unknown');
                setIsOnline(false);
            }
        });
        
        // Cleanup subscription on unmount
        return unsubscribe;
    }, [data.name]);

    // Determine border color based on actual status
    const getBorderColor = () => {
        if (selected) return '#00d4ff';
        return isOnline ? '#10b981' : '#ef4444';
    };

    // Determine status indicator color and animation
    const getStatusIndicator = () => {
        switch (actualStatus) {
            case 'online':
                return {
                    backgroundColor: '#10b981',
                    animation: 'pulse 2s infinite'
                };
            case 'disabled':
                return {
                    backgroundColor: '#6b7280',
                    animation: 'none'
                };
            default: // 'offline', 'unknown'
                return {
                    backgroundColor: '#ef4444',
                    animation: 'none'
                };
        }
    };

    const getStatusText = () => {
        switch (actualStatus) {
            case 'online': return 'Online';
            case 'offline': return 'Offline';
            case 'disabled': return 'Disabled';
            case 'unknown': return 'Unknown';
            default: return actualStatus;
        }
    };

    return React.createElement('div', {
        className: `model-node ${selected ? 'selected' : ''}`,
        style: {
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
            border: `2px solid ${getBorderColor()}`,
            borderRadius: '16px',
            padding: '16px',
            minWidth: '180px',
            minHeight: '140px',
            boxShadow: selected ? '0 0 20px rgba(0, 212, 255, 0.3)' : '0 8px 32px rgba(0, 0, 0, 0.3)',
            transition: 'all 0.3s ease',
            color: '#ffffff',
            position: 'relative',
            overflow: 'hidden'
        }
    }, [
        // Gradient overlay - color based on actual status
        React.createElement('div', {
            key: 'gradient-overlay',
            style: {
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '3px',
                background: isOnline ? 
                    'linear-gradient(90deg, #00d4ff, #7c3aed)' : 
                    'linear-gradient(90deg, #ef4444, #f59e0b)'
            }
        }),
        
        // Input handle
        React.createElement(Handle, {
            key: 'input-handle',
            type: 'target',
            position: Position.Left,
            style: { 
                backgroundColor: isOnline ? '#00d4ff' : '#6b7280',
                border: '2px solid #1a1a2e',
                width: '12px',
                height: '12px'
            }
        }),
        
        // Content
        React.createElement('div', {
            key: 'content',
            style: { textAlign: 'center' }
        }, [
            React.createElement('div', {
                key: 'model-icon',
                style: {
                    fontSize: '24px',
                    marginBottom: '8px',
                    color: isOnline ? '#00d4ff' : '#6b7280'
                }
            }, '🧠'),
            React.createElement('div', {
                key: 'model-name',
                style: {
                    fontSize: '14px',
                    fontWeight: '600',
                    marginBottom: '4px',
                    color: '#ffffff'
                }
            }, modelName),
            React.createElement('div', {
                key: 'model-type',
                style: {
                    fontSize: '10px',
                    color: '#a1a1aa',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    marginBottom: '6px'
                }
            }, modelType || 'ML Model'),
            // Status text - ONLY real backend statuses from socket
            React.createElement('div', {
                key: 'status-text',
                style: {
                    fontSize: '9px',
                    color: actualStatus === 'online' ? '#10b981' : 
                           actualStatus === 'disabled' ? '#6b7280' : '#ef4444',
                    fontWeight: '500',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                }
            }, getStatusText())
        ]),
        
        // Status indicator with real status
        React.createElement('div', {
            key: 'status-indicator',
            style: {
                position: 'absolute',
                top: '12px',
                right: '12px',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                ...getStatusIndicator()
            }
        }),
        
        // Output handle
        React.createElement(Handle, {
            key: 'output-handle',
            type: 'source',
            position: Position.Right,
            style: { 
                backgroundColor: isOnline ? '#00d4ff' : '#6b7280',
                border: '2px solid #1a1a2e',
                width: '12px',
                height: '12px',
                cursor: 'pointer'
            }
        })
    ]);
});

// Enhanced File Upload Node
const FileUploadNode = React.memo(({ data, selected }) => {
    const fileInputRef = useRef(null);
    const [uploadedFiles, setUploadedFiles] = useState([]);
    const [isDragging, setIsDragging] = useState(false);

    const handleFileChange = (event) => {
        const files = Array.from(event.target.files);
        setUploadedFiles(files);
        if (data.onFilesUploaded) {
            data.onFilesUploaded(files);
        }
    };

    const handleDrop = (event) => {
        event.preventDefault();
        setIsDragging(false);
        const files = Array.from(event.dataTransfer.files);
        setUploadedFiles(files);
        if (data.onFilesUploaded) {
            data.onFilesUploaded(files);
        }
    };

    const handleDragOver = (event) => {
        event.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleClick = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    return React.createElement('div', {
        className: `file-upload-node ${selected ? 'selected' : ''}`,
        style: {
            background: isDragging ? 'linear-gradient(135deg, #00d4ff20, #7c3aed20)' : 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
            border: `2px dashed ${selected ? '#00d4ff' : isDragging ? '#00d4ff' : '#374151'}`,
            borderRadius: '16px',
            padding: '20px',
            minWidth: '200px',
            minHeight: '120px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            color: '#ffffff',
            position: 'relative'
        },
        onClick: handleClick,
        onDrop: handleDrop,
        onDragOver: handleDragOver,
        onDragLeave: handleDragLeave
    }, [
        React.createElement('input', {
            key: 'file-input',
            ref: fileInputRef,
            type: 'file',
            multiple: true,
            accept: '.txt,.csv,.json',
            style: { display: 'none' },
            onChange: handleFileChange
        }),
        
        React.createElement('div', {
            key: 'upload-icon',
            style: { 
                fontSize: '32px', 
                marginBottom: '12px',
                color: uploadedFiles.length > 0 ? '#00d4ff' : '#a1a1aa'
            }
        }, uploadedFiles.length > 0 ? '📁' : '📤'),
        
        React.createElement('div', {
            key: 'upload-title',
            style: {
                fontSize: '14px',
                fontWeight: '600',
                marginBottom: '4px',
                color: '#ffffff'
            }
        }, data.mode === 'training' ? 'Upload Training Data' : 'Upload Discharge Files'),
        
        React.createElement('div', {
            key: 'upload-subtitle',
            style: {
                fontSize: '10px',
                color: '#a1a1aa',
                marginBottom: '8px'
            }
        }, 'Drag & drop or click to select'),
        
        uploadedFiles.length > 0 && React.createElement('div', {
            key: 'files-preview',
            style: {
                marginTop: '12px',
                padding: '8px',
                background: 'rgba(0, 212, 255, 0.1)',
                borderRadius: '8px',
                fontSize: '10px'
            }
        }, [
            React.createElement('div', {
                key: 'files-count',
                style: { 
                    color: '#00d4ff',
                    fontWeight: '600',
                    marginBottom: '4px'
                }
            }, `${uploadedFiles.length} file(s) selected`),
            React.createElement('div', {
                key: 'files-list',
                style: { 
                    maxHeight: '40px',
                    overflow: 'auto',
                    color: '#a1a1aa'
                }
            }, uploadedFiles.slice(0, 3).map((file, index) => 
                React.createElement('div', {
                    key: `file-${index}`,
                    style: { fontSize: '8px' }
                }, file.name)
            ))
        ]),
        
        React.createElement(Handle, {
            key: 'output-handle',
            type: 'source',
            position: Position.Right,
            style: { 
                backgroundColor: '#00d4ff',
                border: '2px solid #1a1a2e',
                width: '12px',
                height: '12px'
            }
        })
    ]);
});

// Enhanced Output Node
const OutputNode = React.memo(({ data, selected }) => {
    const [results, setResults] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleClick = () => {
        if (data.onClick) {
            setLoading(true);
            data.onClick().then(results => {
                setResults(results);
                setLoading(false);
            }).catch(error => {
                console.error('Error getting results:', error);
                setLoading(false);
            });
        }
    };

    return React.createElement('div', {
        className: `output-node ${selected ? 'selected' : ''}`,
        style: {
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
            border: `2px solid ${selected ? '#00d4ff' : results ? '#10b981' : '#374151'}`,
            borderRadius: '16px',
            padding: '20px',
            minWidth: '180px',
            minHeight: '120px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            color: '#ffffff',
            position: 'relative',
            overflow: 'hidden'
        },
        onClick: handleClick
    }, [
        React.createElement('div', {
            key: 'top-border',
            style: {
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '3px',
                background: results ? 'linear-gradient(90deg, #10b981, #00d4ff)' : 'linear-gradient(90deg, #374151, #374151)'
            }
        }),
        
        React.createElement(Handle, {
            key: 'input-handle',
            type: 'target',
            position: Position.Left,
            style: { 
                backgroundColor: '#00d4ff',
                border: '2px solid #1a1a2e',
                width: '12px',
                height: '12px'
            }
        }),
        
        React.createElement('div', {
            key: 'output-icon',
            style: { 
                fontSize: '32px', 
                marginBottom: '12px',
                color: results ? '#10b981' : '#a1a1aa'
            }
        }, data.mode === 'training' ? '🎯' : '📊'),
        
        React.createElement('div', {
            key: 'output-title',
            style: {
                fontSize: '14px',
                fontWeight: '600',
                marginBottom: '4px',
                color: '#ffffff'
            }
        }, data.mode === 'training' ? 'Training Results' : 'Prediction Output'),
        
        React.createElement('div', {
            key: 'output-subtitle',
            style: {
                fontSize: '10px',
                color: '#a1a1aa',
                marginBottom: '8px'
            }
        }, 'Click to execute & view results'),
        
        loading && React.createElement('div', {
            key: 'loading-spinner',
            style: {
                width: '16px',
                height: '16px',
                border: '2px solid #00d4ff',
                borderTop: '2px solid transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '8px auto'
            }
        }),
        
        results && React.createElement('div', {
            key: 'results-preview',
            style: {
                marginTop: '8px',
                padding: '8px',
                background: 'rgba(16, 185, 129, 0.1)',
                borderRadius: '8px',
                fontSize: '10px'
            }
        }, [
            React.createElement('div', {
                key: 'results-status',
                style: { 
                    color: '#10b981',
                    fontWeight: '600'
                }
            }, 'Results Ready'),
            React.createElement('div', {
                key: 'results-count',
                style: { 
                    color: '#a1a1aa',
                    fontSize: '8px'
                }
            }, `${Object.keys(results).length} items processed`)
        ])
    ]);
});

// Main Flow Canvas Component
const FlowCanvas = ({ mode, models, onInstanceReady }) => {
    const [nodes, setNodes] = useState([]);
    const [edges, setEdges] = useState([]);
    const [reactFlowInstance, setReactFlowInstance] = useState(null);
    const reactFlowWrapper = useRef(null);

    const nodeTypes = useMemo(() => ({
        modelNode: ModelNode,
        fileUploadNode: FileUploadNode,
        outputNode: OutputNode
    }), []);

    useEffect(() => {
        initializeDefaultNodes();
    }, [mode, models]);

    useEffect(() => {
        if (reactFlowInstance && onInstanceReady) {
            onInstanceReady(reactFlowInstance);
        }
    }, [reactFlowInstance, onInstanceReady]);

    const initializeDefaultNodes = useCallback(() => {
        const fileNode = {
            id: 'file-input',
            type: 'fileUploadNode',
            position: { x: 50, y: 150 },
            data: { 
                mode: mode,
                onFilesUploaded: handleFilesUploaded
            },
        };

        const outputNode = {
            id: 'output',
            type: 'outputNode',
            position: { x: 600, y: 150 },
            data: { 
                mode: mode,
                onClick: handleOutputClick
            },
        };

        setNodes([fileNode, outputNode]);
        setEdges([]);
    }, [mode]);

    const handleFilesUploaded = useCallback((files) => {
        console.log('Files uploaded:', files);
        window.uploadedFiles = files;
    }, []);

    const handleOutputClick = useCallback(async () => {
        const connectedModels = getConnectedModels();
        const files = window.uploadedFiles || [];
        
        if (files.length === 0) {
            alert('Please upload files first');
            return {};
        }

        if (connectedModels.length === 0) {
            alert('Please connect at least one model');
            return {};
        }

        try {
            if (mode === 'prediction') {
                return await processPrediction(files, connectedModels);
            } else {
                return await processTraining(files, connectedModels);
            }
        } catch (error) {
            console.error('Processing error:', error);
            throw error;
        }
    }, [mode, nodes, edges]);

    const getConnectedModels = useCallback(() => {
        const modelNodes = nodes.filter(node => node.type === 'modelNode');
        const connectedModelIds = new Set();
        
        edges.forEach(edge => {
            if (modelNodes.find(node => node.id === edge.target)) {
                connectedModelIds.add(edge.target);
            }
            if (modelNodes.find(node => node.id === edge.source)) {
                connectedModelIds.add(edge.source);
            }
        });

        return Array.from(connectedModelIds).map(id => {
            const node = nodes.find(n => n.id === id);
            return node ? node.data : null;
        }).filter(Boolean);
    }, [nodes, edges]);

    const processPrediction = useCallback(async (files, models) => {
        const formData = new FormData();
        files.forEach(file => formData.append('files', file));
        
        const response = await fetch('/api/orchestrator/predict', {
            method: 'POST',
            body: formData
        });
        
        return await response.json();
    }, []);

    const processTraining = useCallback(async (files, models) => {
        const formData = new FormData();
        files.forEach(file => formData.append('files', file));
        
        const response = await fetch('/api/orchestrator/train', {
            method: 'POST',
            body: formData
        });
        
        return await response.json();
    }, []);

    const onNodesChange = useCallback(
        (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
        []
    );

    const onEdgesChange = useCallback(
        (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
        []
    );

    const onConnect = useCallback(
        (connection) => setEdges((eds) => addEdge({
            ...connection,
            style: { stroke: '#00d4ff', strokeWidth: 2 },
            animated: true
        }, eds)),
        []
    );

    const onDrop = useCallback(
        (event) => {
            event.preventDefault();

            const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
            const modelData = JSON.parse(event.dataTransfer.getData('application/reactflow'));

            if (typeof modelData === 'undefined' || !modelData) {
                return;
            }

            const position = reactFlowInstance.project({
                x: event.clientX - reactFlowBounds.left,
                y: event.clientY - reactFlowBounds.top,
            });

            const newNode = {
                id: `model-${Date.now()}`,
                type: 'modelNode',
                position,
                data: {
                    modelName: modelData.displayName || modelData.name,
                    enabled: modelData.enabled,
                    status: modelData.enabled ? 'online' : 'offline',
                    modelType: modelData.type,
                    ...modelData
                },
            };

            setNodes((nds) => nds.concat(newNode));
        },
        [reactFlowInstance]
    );

    const onDragOver = useCallback((event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onInit = useCallback((instance) => {
        setReactFlowInstance(instance);
    }, []);

    return React.createElement('div', {
        ref: reactFlowWrapper,
        style: { width: '100%', height: '100%' }
    }, 
        React.createElement(ReactFlow, {
            nodes: nodes,
            edges: edges,
            onNodesChange: onNodesChange,
            onEdgesChange: onEdgesChange,
            onConnect: onConnect,
            onInit: onInit,
            onDrop: onDrop,
            onDragOver: onDragOver,
            nodeTypes: nodeTypes,
            fitView: true,
            deleteKeyCode: 'Delete',
            style: { background: '#0f0f23' }
        }, [
            React.createElement(Background, { 
                key: 'background',
                variant: 'dots', 
                gap: 20, 
                size: 1,
                color: '#374151'
            }),
            React.createElement(Controls, {
                key: 'controls',
                style: {
                    background: '#1a1a2e',
                    border: '1px solid #374151',
                    borderRadius: '12px'
                }
            }),
            React.createElement(MiniMap, { 
                key: 'minimap',
                nodeStrokeColor: '#374151',
                nodeColor: '#1a1a2e',
                nodeBorderRadius: 8,
                style: {
                    background: '#1a1a2e',
                    border: '1px solid #374151'
                }
            })
        ])
    );
};

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
    
    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
    }
`;
document.head.appendChild(style);

// Export the main component
window.FlowCanvas = FlowCanvas;
