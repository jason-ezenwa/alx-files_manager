import { v4 as uuidv4 } from 'uuid';
import Queue from 'bull/lib/queue';
import { promisify } from 'util';
import { contentType } from 'mime-types';
import { promises as fs, stat, existsSync, realpath } from 'fs';
import { ObjectID } from 'mongodb';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';


const fileQueue = new Queue('thumbnail generation');


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
        const fileId = inserted.insertedId;
	// start thumbnail generation worker
	if (type === 'image') {
	  const jobName = `Image thumbnail [${userId}-${id}]`;
	  fileQueue.add({ userId, fileId, name: jobName });
	}
        response.status(201).json({
	  id: fileId, userId, name, type, isPublic, parentId,
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
    const page = parseInt(request.query.page, 10) || 0;
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
            },
          ).sort(
            { _id: 1 },
          ).skip(page * 20).limit(20)
            .toArray();
          // to remove the local path and change id representation
          // from _id to id
          const finalFilesArray = [];

          for (const file of requestedFiles) {
            const fileobj = {
              id: file._id,
              userId: file.userId,
              name: file.name,
              type: file.type,
              isPublic: file.isPublic,
              parentId: file.parentId,
            };
            finalFilesArray.push(fileobj);
          }
          response.status(201).send(finalFilesArray);
        } else {
          const requestedFiles = await filesCollection.find(
            {
              userId: userObjId,
            },
          ).sort(
            { _id: 1 },
          ).skip(page * 20).limit(20)
            .toArray();
          // to remove the local path and change id representation
          // from _id to id
          const finalFilesArray = [];

          for (const file of requestedFiles) {
            const fileobj = {
              id: file._id,
              userId: file.userId,
              name: file.name,
              type: file.type,
              isPublic: file.isPublic,
              parentId: file.parentId,
            };
            finalFilesArray.push(fileobj);
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
  static async putPublish(req, res) {
    const { id } = req.params;
    const token = req.header('X-Token');
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    // convert id from string to the ObjectID format it usually is in mongodb
    const userObjId = new ObjectID(userId);
    const fileId = new ObjectID(id);
    if (userId) {
    	const fileFilter = {
      	  _id: fileId,
      	  userId: userObjId
    	}
	const filesCollection = dbClient.db.collection('files');
	const file = await filesCollection.findOne(fileFilter);
	if (!file) {
	  res.status(404).json({ error: 'Not found'});
	  return;
	}
	await filesCollection.updateOne(fileFilter, { $set: {isPublic: true} });
	res.status(200).json({
	 id: file._id,
         userId: file.userId,
         name: file.name,
         type: file.type,
         isPublic: true,
         parentId: file.parentId,
	});
    }
  }
  static async putUnPublish(req, res) {
    const { id } = req.params;
    const token = req.header('X-Token');
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    // convert id from string to the ObjectID format it usually is in mongodb
    const userObjId = new ObjectID(userId);
    const fileId = new ObjectID(id);
    if (userId) {
        const fileFilter = {
          _id: fileId,
          userId: userObjId
        }
        const filesCollection = dbClient.db.collection('files');
        const file = await filesCollection.findOne(fileFilter);
        if (!file) {
          res.status(404).json({ error: 'Not found'});
          return;
        }
        await filesCollection.updateOne(fileFilter, { $set: {isPublic: false} });
        res.status(200).json({
         id: file._id,
         userId: file.userId,
         name: file.name,
         type: file.type,
         isPublic: false,
         parentId: file.parentId,
        });
    }
  }
  static async getFile(req, res) {
    const { id } = req.params;
    const size = req.query.size || null;
    console.log(req);
    const token = req.header('X-Token');
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    // convert id from string to the ObjectID format it usually is in mongodb
    const userObjId = new ObjectID(userId);
    const fileId = new ObjectID(id);
    if (userId) {
        const fileFilter = {
          _id: fileId,
        }
        const filesCollection = dbClient.db.collection('files');
        const file = await filesCollection.findOne(fileFilter);
        if (!file) {
          res.status(404).json({ error: 'Not found'});
          return;
        }
	if (file.type === 'folder') {
	  res.status(400).json({ error: 'A folder doesnt\'t have content'});
	  return;
	}
	let filePath = file.localPath;
	if (size) {
          filePath = `${file.localPath}_${size}`;
	}
	const statAsync = promisify(stat);
	const realpathAsync = promisify(realpath);
	if (existsSync(filePath)) {
	  const fileInfo = await statAsync(filePath);
	  if (!fileInfo.isFile()) {
            res.status(404).json({ error: 'Not found' });
            return;
	  }
	} else {
	  res.status(404).json({ error: 'Not found' });
	  return ;
	}
        const absoluteFilePath = await realpathAsync(filePath);
	res.setHeader('Content-Type', contentType(file.name) || 'text/plain; charset=utf-8');
	res.status(200).sendFile(absoluteFilePath);
    }
  }

}



module.exports = FilesController;
