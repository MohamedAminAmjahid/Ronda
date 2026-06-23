import { router, type Href } from 'expo-router'
import { LangPickerScreen } from '../ui/LangPickerScreen'
import { setLang } from '../i18n/useI18n'

export default function LangPickerRoute() {
  return (
    <LangPickerScreen
      onPick={(lang) => {
        setLang(lang)
        router.replace('/' as Href)
      }}
    />
  )
}
