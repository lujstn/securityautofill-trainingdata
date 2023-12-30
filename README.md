# securityautofill-trainingdata

This repository contains the code for the training data generation for the security autofill project.
We scrape the website https://quackr.io/ for texts made to temporary phone numbers, because these are often OTP codes - meaning we can use these as training data. We fetch all available countries, then fetch all available phone numbers for each country, then fetch all available messages, and persist them to a CSV file.
