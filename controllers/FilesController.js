import { v4 as uuidv4 } from 'uuid';
import { promises as fs } from 'fs';
import { ObjectID } from 'mongodb';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

class FilesController {
  static async postUpload(request, response) {
    const token = request.header('X-Token');
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    // convert id from string to the ObjectID format it usually is in mongodb
    const userObjId = new ObjectID(userId);
    if (userId) {
      const users = dbClient.db.collection('users');
      const existingUser = await users.findOne({ _id: userObjId });
      if (!existingUser) {
        response.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const { name } = request.body;
      const { type } = request.body;
      const { data } = request.body;
      const parentId = request.body.parentId || 0;
      const isPublic = request.body.isPublic || false;
      const allowedTypes = ['file', 'folder', 'image'];
      if (!name) {
        response.status(400).json({ error: 'Missing name' });
        return;
      }
      // If the type is missing or not part of the list of accepted type
      if (!type || !allowedTypes.includes(type)) {
        response.status(400).json({ error: 'Missing type' });
        return;
      }
      if (!data && type !== 'folder') {
        response.status(400).json({ error: 'Missing data' });
        return;
      }
      if (parentId) {
        const filesCollection = dbClient.db.collection('files');
        const parentidObject = new ObjectID(parentId);
        const existingFileWithParentId = await filesCollection.findOne(
          { _id: parentidObject, userId: existingUser._id },
        );
        if (!existingFileWithParentId) {
          response.status(400).json({ error: 'Parent not found' });
          return;
        }
        if (existingFileWithParentId.type !== 'folder') {
          response.status(400).json({ error: 'Parent is not a folder' });
          return;
        }
      }
      if (type === 'folder') {
        const filesCollection = dbClient.db.collection('files');
        const inserted = await filesCollection.insertOne(
          {
            userId: existingUser._id,
            name,
            type,
            isPublic,
            parentId,
          },
        );
        const id = inserted.insertedId;
        response.status(201).json({
          id, userId, name, type, isPublic, parentId,
        });
      } else {
        const filesCollection = dbClient.db.collection('files');
        const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
        const uuidstr = uuidv4();
        const parentidObject = new ObjectID(parentId);
        // file name
        const filePath = `${folderPath}/${uuidstr}`;
        const buff = Buffer.from(data, 'base64');
        try {
          await fs.mkdir(folderPath);
        } catch (error) {
          // do nothing if folder already exists
        }
        try {
          await fs.writeFile(filePath, buff, 'utf-8');
        } catch (error) {
          console.log(error);
        }
        const inserted = await filesCollection.insertOne(
          {
            userId: existingUser._id,
            name,
            type,
            isPublic,
            parentId: parentidObject,
            localPath: filePath,
          },
        );
        const id = inserted.insertedId;
        response.status(201).json({
          id, userId, name, type, isPublic, parentId,
        });
      }
    } else {
      response.status(401).json({ error: 'Unauthorized' });
    }
  }

  static async getShow(request, response) {
    const fileId = request.params.id;
    // convert id from string to the ObjectID format it usually is in mongodb
    const fileObjId = new ObjectID(fileId);
    const token = request.header('X-Token');
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    // convert id from string to the ObjectID format it usually is in mongodb
    const userObjId = new ObjectID(userId);
    if (userId) {
      const users = dbClient.db.collection('users');
      const existingUser = await users.findOne({ _id: userObjId });
      if (existingUser) {
        const files = dbClient.db.collection('files');
        const requestedFile = await files.findOne({ _id: fileObjId });
        if (!requestedFile) {
          response.status(404).json({ error: 'Not found' });
          return;
        }
        response.status(200).json(
          {
            id: requestedFile._id,
            userId: requestedFile.userId,
            name: requestedFile.name,
            type: requestedFile.type,
            isPublic: requestedFile.isPublic,
            parentId: requestedFile.parentId,
          },
        );
      } else {
        response.status(401).json({ error: 'Unauthorized' });
      }
    } else {
      response.status(401).json({ error: 'Unauthorized' });
    }
  }

  static async getIndex(request, response) {
    // convert id from string to the ObjectID format it usually is in mongodb
    const { parentId } = request.query;
    const page = parseInt(request.query.page) || 0
    const token = request.header('X-Token');
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    // convert id from string to the ObjectID format it usually is in mongodb
    const userObjId = new ObjectID(userId);
    if (userId) {
      const users = dbClient.db.collection('users');
      const filesCollection = dbClient.db.collection('files');
      const existingUser = await users.findOne({ _id: userObjId });
      if (existingUser) {
        if (parentId) {
          const parentObjId = new ObjectID(parentId);
          // if parentId is set and does not exist, return empty list.
          const existingParentFolder = await filesCollection.findOne(
            {
              _id: parentObjId,
              userId: existingUser._id,
            },
          );
          if (!existingParentFolder) {
            response.status(201).send([]);
            return;
          }
          // get all files in parent directory
          // pagination syntax is from mongodb documentation.
          const requestedFiles = await filesCollection.find(
            {
              userId: userObjId,
              parentId: parentObjId,
            }
          ).sort(
            {_id: 1
            }).skip(page * 20 ).limit(20).toArray();
          // to remove the local path and change id representation
          // from _id to id
          const finalFilesArray = []

          for (const file of requestedFiles) {
            const fileobj = {
              id: file._id,
              userId: file.userId,
              name: file.name,
              type: file.type,
              isPublic: file.isPublic,
              parentId: file.parentId
            };
            finalFilesArray.push(fileobj)
          }
          response.status(201).send(finalFilesArray);
        } else {
          const requestedFiles = await filesCollection.find(
            {
              userId: userObjId,
            }
          ).sort(
            {_id: 1
            }).skip(page * 20 ).limit(20).toArray();
          // to remove the local path and change id representation
          // from _id to id
          const finalFilesArray = []

          for (const file of requestedFiles) {
            const fileobj = {
              id: file._id,
              userId: file.userId,
              name: file.name,
              type: file.type,
              isPublic: file.isPublic,
              parentId: file.parentId
            };
            finalFilesArray.push(fileobj)
          }
          response.status(201).send(finalFilesArray);
        }
      } else {
        response.status(401).json({ error: 'Unauthorized' });
      }
    } else {
      response.status(401).json({ error: 'Unauthorized' });
    }
  }

  static async putPublish (request, response) {
    const token = request.header('X-Token');
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    const fileId = request.params.id;
    // convert id from string to the ObjectID format it usually is in mongodb
    const fileObjId = new ObjectID(fileId);
    const userObjId = new ObjectID(userId);
    if (userId) {
      const users = dbClient.db.collection('users');
      const filesCollection = dbClient.db.collection('files');
      const existingUser = await users.findOne({ _id: userObjId });
      if (!existingUser) {
        response.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const fileToBeSet = await filesCollection.findOne({ _id: fileObjId, userId: userObjId});
      if (!fileToBeSet) {
        response.status(404).json({ error: 'Not found' });
        return;
      }
      const updatedfile = await filesCollection.updateOne({ _id: fileObjId, userId: userObjId}, {$set: {'isPublic': true}});
      response.status(200).json(
        {
          id: updatedfile._id,
          userId: updatedfile.userId,
          name: updatedfile.name,
          type: updatedfile.type,
          isPublic: updatedfile.isPublic,
          parentId: updatedfile.parentId,
        },
      );


    } else {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }
  
  static async putUnpublish (request, response) {
    const token = request.header('X-Token');
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    const fileId = request.params.id;
    // convert id from string to the ObjectID format it usually is in mongodb
    const fileObjId = new ObjectID(fileId);
    const userObjId = new ObjectID(userId);
    if (userId) {
      const users = dbClient.db.collection('users');
      const filesCollection = dbClient.db.collection('files');
      const existingUser = await users.findOne({ _id: userObjId });
      if (!existingUser) {
        response.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const fileToBeSet = await filesCollection.findOne({ _id: fileObjId, userId: userObjId});
      if (!fileToBeSet) {
        response.status(404).json({ error: 'Not found' });
        return;
      }
      const updatedfile = await filesCollection.updateOne({ _id: fileObjId, userId: userObjId}, {$set: {'isPublic': false}});
      response.status(200).json(
        {
          id: updatedfile._id,
          userId: updatedfile.userId,
          name: updatedfile.name,
          type: updatedfile.type,
          isPublic: updatedfile.isPublic,
          parentId: updatedfile.parentId,
        },
      );


    } else {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }
}

module.exports = FilesController;
