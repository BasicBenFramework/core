#!/usr/bin/env node

import { parseArgs } from '../src/cli/parser.js'
import { dispatch } from '../src/cli/dispatcher.js'

const { command, args, flags } = parseArgs(process.argv.slice(2))

dispatch(command, args, flags)
