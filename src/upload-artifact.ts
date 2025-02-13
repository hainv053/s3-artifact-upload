import * as core from "@actions/core";
import * as fs from "fs";
import * as mime from "mime-types";
import * as path from "path";

import { findFilesToUpload } from "./search";
import { getInputs } from "./input-helper";
import { NoFileOptions } from "./constants";

import { PutBucketAclCommand, PutBucketAclCommandInput, PutObjectCommandInput, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

async function run(): Promise<void> {
  try {
    const inputs = getInputs();
    const searchResult = await findFilesToUpload(inputs.searchPath);

    if (searchResult.filesToUpload.length === 0) {
      // No files were found. Handle according to the input option.
      switch (inputs.ifNoFilesFound) {
        case NoFileOptions.warn: {
          core.warning(
            `No files were found with the provided path: ${inputs.searchPath}. No artifacts will be uploaded.`,
          );
          break;
        }
        case NoFileOptions.error: {
          core.setFailed(
            `No files were found with the provided path: ${inputs.searchPath}. No artifacts will be uploaded.`,
          );
          break;
        }
        case NoFileOptions.ignore: {
          core.info(
            `No files were found with the provided path: ${inputs.searchPath}. No artifacts will be uploaded.`,
          );
          break;
        }
      }
    } else {
      // Create the S3 client using AWS SDK v3.
      const s3Client = new S3Client({
        region: inputs.region,
        endpoint: inputs.s3Endpoint,
        forcePathStyle: false,
        credentials: {
          accessKeyId: inputs.s3AccessKey,
          secretAccessKey: inputs.s3SecretAccessKey,
        },
        maxAttempts: 10,
      });

      if (inputs.s3Prefix !== "") {
        core.info("NOTE: s3-prefix specified, ignoring name parameter");
      }

      // If s3Prefix is left blank, use a default value based on the GitHub context.
      const s3Prefix = inputs.s3Prefix;

      const fileCount = searchResult.filesToUpload.length;
      const pluralSuffix = fileCount === 1 ? "" : "s";
      core.info(
        `With the provided path, there will be ${fileCount} file${pluralSuffix} uploaded`,
      );
      core.info(`Uploading to S3 prefix: ${s3Prefix}`);
      core.debug(`Root artifact directory is ${searchResult.rootDirectory}`);

      const retentionDays = inputs.retentionDays || 90;
      const today = new Date();
      const expirationDate = new Date(today);
      expirationDate.setDate(expirationDate.getDate() + retentionDays);

      // Iterate over all files to be uploaded.
      for await (const fileName of searchResult.filesToUpload) {
        core.debug(
          JSON.stringify({
            rootDirectory: searchResult.rootDirectory,
            fileName,
          }),
        );

        // Derive the relative file path.
        const relativeName = fileName.replace(
          String.raw`${searchResult.rootDirectory}${path.sep}`,
          "",
        );
        // Construct the S3 key (using forward slashes).
        const uploadKey = `${s3Prefix}/${relativeName}`.replace(
          new RegExp(`\\${path.sep}`, "g"),
          "/",
        );

        // Create a read stream for the file.
        const fileStream = fs.createReadStream(fileName);
        const contentType = mime.lookup(uploadKey).toString();

        // Set the upload parameters.
        const uploadParams: PutObjectCommandInput = {
          Bucket: inputs.s3Bucket,
          Key: uploadKey,
          Body: fileStream,
          Expires: expirationDate,
          ACL: "public-read",
          ContentType: contentType,
        };

        // Configure multipart upload options.
        const uploadOptions = {
          client: s3Client,
          params: uploadParams,
          queueSize: 5, // Maximum concurrent parts
          partSize: 10 * 1024 * 1024, // 10 MB per part
        };

        core.info(`Starting upload of ${relativeName}`);

        try {
          // Create a new Upload instance and wait for it to complete.
          const parallelUploader = new Upload(uploadOptions);
          await parallelUploader.done();
        } catch (err: any) {
          core.error(`Error uploading ${relativeName}: ${err.message}`);
          throw err;
        } finally {
          core.info(`Finished upload of ${relativeName}`);
        }
      }
    }
  } catch (err: any) {
    core.setFailed(err.message);
  }
}

run();
