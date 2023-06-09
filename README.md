# Files Manager API
This repository contains an API for a files manager that enables user authentication, temporary storage with Redis, creation of image thumbnails, and storage of file information using MongoDB. This collaborative project was developed by Chukwuemelie Obumse and Afeez Abu.

Features
The Files Manager API provides the following features:

User Authentication: The API supports user authentication, allowing users to securely access their files and manage them through appropriate authorization mechanisms.

Temporary Storage with Redis: The API utilizes Redis as a temporary storage solution, for storage of access tokens created upon authorisation for accessing endpoints without the need to log in every time.

Creation of Image Thumbnails: The API incorporates functionality to generate image thumbnails. When a user uploads an image file, the API automatically generates a thumbnail version using a worker process and queing system, facilitating faster rendering and improved user experience.

Storage of File Information using MongoDB: The API leverages MongoDB as a database to store file information. This allows for efficient querying, indexing, and retrieval of file-related data, ensuring seamless management and organization of files.

# Installation
To set up the File Manager API on your local environment, please follow these steps:

1. Clone this repository to your local machine using the following command: `git clone https://github.com/JasonFlair/alx-files_manager`.

2. Install the required dependencies by running the following command in the project's root directory: `npm install`.

3. Start the server and worker in two different terminals using `npm run start-server` and `npm run start-worker`.