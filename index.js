const core = require('@actions/core');
const tc = require('@actions/tool-cache');
const io = require('@actions/io');
const exec = require('@actions/exec');
const path = require('path');
const github = require('@actions/github');

// Main entry function
//
async function main(){

  try {

    // Get inputs
    const token = core.getInput('github-token');

    var fpmVersion = core.getInput('fpm-version');
    console.log(`fpm-version: ${fpmVersion}`);

    const fpmRepo = core.getInput('fpm-repository');
    console.log(`fpm-repository: ${fpmRepo}`);

    // Get latest version if requested
    if (fpmVersion === 'latest'){

      if (token === 'none') {
        core.setFailed('To fetch the latest fpm version, please supply a github token. Alternatively you can specify the fpm release version manually.');
      }

      try {

        fpmVersion = await getLatestReleaseVersion(token);

      } catch (error) {

        core.setFailed('Error while querying the latest fpm release version - please check your github token.');

      }

    }

    // Build download path
    const fetchPath = fpmRepo + '/releases/download/' + fpmVersion + '/';
    const filename = getFPMFilename(fpmVersion,process.platform);

    console.log(`This platform is ${process.platform}`);    
    console.log(`Fetching fpm from ${fetchPath}${filename}`);

    // Download release
    var fpmPath;
    try {
        
      // Try downloading the file without the compiler suffix      
      const filename = getFPMFilename(fpmVersion, process.platform);
      fpmPath = await tc.downloadTool(fetchPath + filename);

    } catch (error) {
        
      // If download fails, try adding compiler suffixes
      const compilers = ['gcc-10', 'gcc-11', 'gcc-12', 'gcc-13', 'gcc-14'];
      
      let success = false;
      
      for (const compiler of compilers) {
            
        // Generate the filename with the compiler suffix
        const filenameWithSuffix = getFPMFilename(fpmVersion, process.platform, compiler);
        console.log(`Trying to fetch compiler-built fpm: ${filenameWithSuffix}`);

        try {
          fpmPath = await tc.downloadTool(fetchPath + filenameWithSuffix);
          success = true;
          break;  // If download is successful, break out of the loop
        } catch (error) {
          console.log(`  -> Failed to download ${filenameWithSuffix}`);
        }
        
      }

      if (!success) {
        core.setFailed(`Error while trying to fetch fpm - please check that a version exists at the above release url.`);
      }
    }

    console.log(fpmPath);
    const downloadDir = path.dirname(fpmPath);

    // Add executable flag on unix
    if (process.platform === 'linux' || process.platform === 'darwin'){

      await exec.exec('chmod u+x '+fpmPath);

    }

    // Rename to 'fpm'
    if (process.platform === 'win32') {

      await io.mv(fpmPath, downloadDir + '/' + 'fpm.exe');

    } else {

      await io.mv(fpmPath, downloadDir + '/' + 'fpm');

    }

    // Add to path
    core.addPath( downloadDir );
    console.log(`fpm added to path at ${downloadDir}`);

  } catch (error) {

    core.setFailed(error.message);

  }
};

// Construct the filename for an fpm release
//
//  fpm-<version>-<os>-<arch>[-<compiler>][.exe]
//
//  <version> is a string of form X.Y.Z corresponding to a release of fpm
//  <os> is either 'linux', 'macos', or 'windows'
//  <arch> here is always 'x86_64'
//  <compiler> is an optional string like '-gcc-12'
//
function getFPMFilename(fpmVersion, platform, compiler = '') {
  var filename = 'fpm-';
  
  // Remove the leading 'v' if it exists
  filename += fpmVersion.replace('v', '') + '-';

  // Add the platform and architecture
  if (platform === 'linux') {
    filename += 'linux-x86_64';
  } else if (platform === 'darwin') {
    filename += 'macos-x86_64';
  } else if (platform === 'win32') {
    filename += 'windows-x86_64';
  } else {
    core.setFailed('Unknown platform');
  }

  // If a compiler is provided, append it as a suffix 
  if (compiler) filename += `-${compiler}`; 
  
  // Add the '.exe' suffix for Windows 
  if (platform === 'win32') filename += '.exe'; 

  return filename;
}


// Query github API to find the tag for the latest release
//
async function getLatestReleaseVersion(token){

  const octokit = github.getOctokit(token);

  const {data: latest} = await octokit.request('GET /repos/{owner}/{repo}/releases/latest', {
                            owner: 'fortran-lang',
                            repo: 'fpm'});

  return latest.tag_name;

}


// Call entry function
main();
