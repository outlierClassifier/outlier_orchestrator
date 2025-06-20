# outlier_orchestrator

This repository implements the orchestrator for our disruption prediction system. Messages are described at the [outlier protocol](https://github.com/outlierClassifier/outlier_protocol). The orchestrator now speaks the **outlier node protocol v0.1.0** when communicating with prediction nodes.

## Installation

```bash
# Clone the repository
git clone https://github.com/outlierClassifier/outlier_orchestrator.git

# Enter the directory
cd outlier_orchestrator

# Install dependencies
npm install

# Create .env file (based on .env.example)
cp .env.example .env
```

## API Endpoints

See [outlier_protocol](https://github.com/outlierClassifier/outlier_protocol) for detailed API specifications.
The orchestrator also exposes `/api/train/raw` for uploading sensor text files directly. This endpoint parses the files server-side and starts the training session using the outlier node protocol.

## Developed with

* [Node.js](https://nodejs.org/) - JavaScript runtime environment
* [Express](https://expressjs.com/) - Web framework for Node.js
* [Axios](https://axios-http.com/) - Promise-based HTTP client
* [Winston](https://github.com/winstonjs/winston) - Logger for Node.js
