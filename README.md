# outlier_orchestrator

This repository implements the orchestrator for our disruption prediction system. Messages are described at the [outlier protocol](https://github.com/outlierClassifier/outlier_protocol).

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

## Developed with

* [Node.js](https://nodejs.org/) - JavaScript runtime environment
* [Express](https://expressjs.com/) - Web framework for Node.js
* [Axios](https://axios-http.com/) - Promise-based HTTP client
* [Winston](https://github.com/winstonjs/winston) - Logger for Node.js
