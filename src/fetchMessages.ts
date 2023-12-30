import { addExtra } from 'puppeteer-extra'
import Stealth from 'puppeteer-extra-plugin-stealth'
import Recaptcha from 'puppeteer-extra-plugin-recaptcha'
import { Cluster } from 'puppeteer-cluster'
import vanillaPuppeteer from 'puppeteer'
import { formatISO } from 'date-fns'
import fs from 'fs'
import path from 'path'
import parse from 'csv-parse'

function convertDynamicTimeToISO(timeString: string) {
  const units = timeString.split(' ')[1]
  let amount = parseInt(timeString.split(' ')[0])

  if (units.startsWith('minute')) {
    amount *= 60 * 1000
  } else if (units.startsWith('hour')) {
    amount *= 60 * 60 * 1000
  } else if (units.startsWith('day')) {
    amount *= 24 * 60 * 60 * 1000
  } else if (units.startsWith('week')) {
    amount *= 7 * 24 * 60 * 60 * 1000
  } else if (units.startsWith('month')) {
    amount *= 30 * 24 * 60 * 60 * 1000
  } else if (units.startsWith('year')) {
    amount *= 365 * 24 * 60 * 60 * 1000
  }

  const date = new Date(Date.now() - amount)
  return formatISO(date)
}

export async function fetchMessages(phoneUrls: string[]) {
  // Create a puppeteer cluster
  const puppeteer = addExtra(vanillaPuppeteer)
  puppeteer.use(Stealth())
  puppeteer.use(Recaptcha())
  const cluster = await Cluster.launch({
    puppeteer,
    maxConcurrency: 20,
    concurrency: Cluster.CONCURRENCY_CONTEXT,
  })
  await cluster.task(async ({ page, data: url }) => {
    await page.goto(url)
    await page.waitForSelector('.flag-icon', { timeout: 5_000 })
    const sms = await page.evaluate(() =>
      Array.from(document.querySelectorAll('tr[_ngcontent-serverapp-c10]'))
        .filter((e: any) => e.nodeName === 'TR')
        .filter(
          tr =>
            Array.from(tr.children)[0]?.textContent != null &&
            Array.from(tr.children)[0]?.textContent !== '' &&
            Array.from(tr.children)[0]?.textContent !== 'Received',
        )
        .map(tr => {
          const tdArray = Array.from(tr.children)
          return {
            timestamp: tdArray[0]?.textContent || '',
            sender: tdArray[1]?.textContent || '',
            message: tdArray[2]?.textContent || '',
            receiver: '',
            country: '',
          }
        }),
    )
    sms.forEach(message => {
      message.receiver = url.split('/').filter(Boolean).pop() || ''
      message.country = url.split('/').filter(Boolean).slice(-2, -1)[0] || ''
    })
    return sms
  })

  // Begin queueing tasks to get phone numbers from all countries concurrently
  const smsPromises = phoneUrls.map(phone => cluster.execute(phone))
  try {
    // Wait for all tasks to complete
    const smsMessages = await Promise.all(smsPromises)
    let flattenedSmsMessages = [...new Set(smsMessages.flat())]
    flattenedSmsMessages.forEach(sms => {
      if (sms.timestamp) {
        sms.timestamp = convertDynamicTimeToISO(sms.timestamp)
      }
    })

    // Find or create CSV file
    const dataPath = path.join(__dirname, '..', 'messages.csv')
    const createCsvWriter = require('csv-writer').createObjectCsvWriter
    const csvWriter = createCsvWriter({
      path: dataPath,
      header: [
        { id: 'timestamp', title: 'TIMESTAMP' },
        { id: 'country', title: 'COUNTRY' },
        { id: 'sender', title: 'SENDER' },
        { id: 'receiver', title: 'RECEIVER' },
        { id: 'message', title: 'MESSAGE' },
      ],
      append: fs.existsSync(dataPath),
    })

    // Read existing data, if exists
    let existingData = ''
    let records: any[] = []
    if (fs.existsSync(dataPath)) {
      existingData = fs.readFileSync(dataPath, 'utf8')
      parse.parse(
        existingData,
        { columns: true, relax_column_count: true },
        (err, output) => {
          if (err) {
            console.error(err)
          } else {
            records = output
          }
        },
      )
    }

    // Filter out messages that already exist in the CSV
    const newMessages = flattenedSmsMessages.filter(
      sms =>
        !records.some(
          (record: any) =>
            record.sender === sms.sender &&
            record.message === sms.message &&
            record.country === sms.country &&
            record.receiver === sms.receiver,
        ),
    )

    // Write new messages to CSV
    await csvWriter.writeRecords(newMessages)
    console.log('The CSV file was written successfully')
    return flattenedSmsMessages
  } catch (e) {
    console.error(e)
    throw e
  } finally {
    // Gracefully close the cluster
    await cluster.idle()
    await cluster.close()
  }
}
