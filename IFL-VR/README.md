# IFL-VR Project

## Overview
IFL-VR is a virtual reality project designed to create immersive experiences. This project includes components for managing the VR scene, player interactions, and environmental settings.

## Project Structure
```
IFL-VR
├── src
│   ├── components
│   ├── utils
│   ├── assets
│   └── main.ts
├── tests
├── config
├── package.json
├── tsconfig.json
└── README.md
```

## Setup Instructions
1. Clone the repository:
   ```
   git clone <repository-url>
   ```
2. Navigate to the project directory:
   ```
   cd IFL-VR
   ```
3. Install dependencies:
   ```
   npm install
   ```
4. Run the application:
   ```
   npm start
   ```

## Components
- **VRScene**: Manages the virtual reality scene, including initialization and object management.
- **Player**: Represents the player in the VR environment, handling movement and interactions.
- **Environment**: Sets up the virtual environment with lighting and background elements.

## Utilities
- **VRControls**: Initializes VR controls for user interaction.
- **Physics**: Simulates physics interactions within the VR environment.

## Testing
Unit tests are included in the `tests` directory to ensure the functionality of the components.

## Configuration
Configuration settings for the VR application can be found in `config/vr-config.json`.

## License
This project is licensed under the MIT License.