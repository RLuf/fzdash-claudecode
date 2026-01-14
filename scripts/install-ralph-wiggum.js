#!/usr/bin/env node

/**
 * Ralph-Wiggum Plugin Installer
 * Installs the official ralph-wiggum plugin for Claude Code
 *
 * Official repo: https://github.com/anthropics/claude-code/tree/main/plugins/ralph-wiggum
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import ora from 'ora';

const PLUGIN_REPO = 'https://github.com/anthropics/claude-code.git';
const PLUGIN_NAME = 'ralph-wiggum';

function getPluginDir() {
  const platform = process.platform;

  if (platform === 'win32') {
    return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'claude-code', 'plugins');
  } else if (platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'claude-code', 'plugins');
  } else {
    return join(homedir(), '.config', 'claude-code', 'plugins');
  }
}

function checkClaudeCodeInstalled() {
  try {
    execSync('claude --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function installRalphWiggum() {
  console.log(chalk.cyan('\n╔════════════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan('║') + chalk.white('  Ralph-Wiggum Plugin Installer for Claude Code             ') + chalk.cyan('║'));
  console.log(chalk.cyan('╚════════════════════════════════════════════════════════════╝\n'));

  // Check if Claude Code is installed
  const spinner = ora('Checking Claude Code installation...').start();

  if (!checkClaudeCodeInstalled()) {
    spinner.fail('Claude Code not found');
    console.log(chalk.red('\n✗ Claude Code is not installed or not in PATH'));
    console.log(chalk.yellow('\nPlease install Claude Code first:'));
    console.log(chalk.white('  npm install -g @anthropic-ai/claude-code'));
    process.exit(1);
  }

  spinner.succeed('Claude Code found');

  // Get plugin directory
  const pluginDir = getPluginDir();
  const ralphPluginDir = join(pluginDir, PLUGIN_NAME);

  console.log(chalk.gray(`\nPlugin directory: ${pluginDir}`));

  // Create plugin directory if it doesn't exist
  if (!existsSync(pluginDir)) {
    const createSpinner = ora('Creating plugin directory...').start();
    mkdirSync(pluginDir, { recursive: true });
    createSpinner.succeed('Plugin directory created');
  }

  // Check if plugin already exists
  if (existsSync(ralphPluginDir)) {
    console.log(chalk.yellow(`\n⚠ Ralph-Wiggum plugin already exists at: ${ralphPluginDir}`));
    console.log(chalk.yellow('  To reinstall, delete the directory first:\n'));
    console.log(chalk.gray(`  rm -rf "${ralphPluginDir}"\n`));
    process.exit(0);
  }

  // Clone the plugin
  const cloneSpinner = ora('Cloning ralph-wiggum plugin...').start();
  const tempDir = join(pluginDir, '.ralph-wiggum-temp');

  try {
    // Clone only the specific plugin directory using sparse checkout
    execSync(`git clone --depth 1 --filter=blob:none --sparse ${PLUGIN_REPO} "${tempDir}"`, {
      stdio: 'pipe'
    });

    execSync(`cd "${tempDir}" && git sparse-checkout set plugins/${PLUGIN_NAME}`, {
      stdio: 'pipe'
    });

    // Copy plugin to final location
    const pluginSource = join(tempDir, 'plugins', PLUGIN_NAME);
    execSync(`cp -r "${pluginSource}" "${ralphPluginDir}"`, {
      stdio: 'pipe'
    });

    // Clean up temp directory
    execSync(`rm -rf "${tempDir}"`, { stdio: 'pipe' });

    cloneSpinner.succeed('Plugin cloned successfully');
  } catch (error) {
    cloneSpinner.fail('Failed to clone plugin');
    console.error(chalk.red('\n✗ Error:'), error.message);

    // Clean up on failure
    if (existsSync(tempDir)) {
      execSync(`rm -rf "${tempDir}"`, { stdio: 'pipe' });
    }

    process.exit(1);
  }

  // Install plugin dependencies if package.json exists
  const packageJsonPath = join(ralphPluginDir, 'package.json');

  if (existsSync(packageJsonPath)) {
    const installSpinner = ora('Installing plugin dependencies...').start();

    try {
      execSync(`cd "${ralphPluginDir}" && npm install`, {
        stdio: 'pipe'
      });
      installSpinner.succeed('Dependencies installed');
    } catch (error) {
      installSpinner.warn('Failed to install dependencies (plugin may still work)');
      console.log(chalk.yellow(`  You can try installing manually: cd "${ralphPluginDir}" && npm install`));
    }
  }

  // Success message
  console.log(chalk.green('\n✓ Ralph-Wiggum plugin installed successfully!\n'));
  console.log(chalk.white('Plugin location:'), chalk.gray(ralphPluginDir));
  console.log(chalk.white('\nThe plugin enables iterative agentic loops with:'));
  console.log(chalk.gray('  • Automatic retry on errors'));
  console.log(chalk.gray('  • Checkpoint recovery'));
  console.log(chalk.gray('  • Multi-step execution plans'));
  console.log(chalk.gray('  • Progress tracking\n'));
  console.log(chalk.cyan('To use ralph-wiggum in Claude Code, restart your Claude Code instance.\n'));
}

// Run installer
try {
  installRalphWiggum();
} catch (error) {
  console.error(chalk.red('\n✗ Installation failed:'), error.message);
  process.exit(1);
}
