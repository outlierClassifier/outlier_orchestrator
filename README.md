# outlier_orchestrator

This repository implements the orchestrator for our disruption prediction system. Messages follow the [outlier protocol](https://github.com/outlierClassifier/outlier_protocol) which defines how the orchestrator communicates with each node.

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

The orchestrator talks to each prediction node using the following endpoints defined in the protocol:

- `GET /health` – health information for the node
- `POST /train` – starts a training session
- `POST /train/{ordinal}` – sends each discharge for the current session
- `POST /predict` – runs the prediction for a single discharge

For more details see the [outlier_protocol](https://github.com/outlierClassifier/outlier_protocol) repository.

## Developed with

* [Node.js](https://nodejs.org/) - JavaScript runtime environment
* [Express](https://expressjs.com/) - Web framework for Node.js
* [Axios](https://axios-http.com/) - Promise-based HTTP client
* [Winston](https://github.com/winstonjs/winston) - Logger for Node.js
